// Redis runs each script without interleaving other commands. Check preconditions
// before writes: Lua runtime errors do not roll back earlier writes.
const ENQUEUE = `
    local readyType = redis.call('TYPE', KEYS[1]).ok
    if readyType ~= 'none' and readyType ~= 'list' then
        return redis.error_reply('jobs:ready must be a list')
    end
    if redis.call('EXISTS', KEYS[2]) == 1 then
        return redis.error_reply('Job ID already exists')
    end
    redis.call('HSET', KEYS[2],
        'id', ARGV[1], 'type', ARGV[2], 'payload', ARGV[3],
        'status', 'pending', 'createdAt', ARGV[4], 'updatedAt', ARGV[4],
        'attempts', 0, 'maxAttempts', ARGV[5])
    redis.call('LPUSH', KEYS[1], ARGV[1])
    return 1
`;

const CLAIM = `
    local id = redis.call('LINDEX', KEYS[1], -1)
    if not id then return nil end
    local jobKey = 'job:' .. id
    if redis.call('HGET', jobKey, 'status') ~= 'pending' then
        return redis.error_reply('Ready job has missing or invalid metadata')
    end
    if redis.call('ZSCORE', KEYS[2], id) then
        return redis.error_reply('Ready job is already processing')
    end
    local attempts = tonumber(redis.call('HGET', jobKey, 'attempts'))
    local maxAttempts = tonumber(redis.call('HGET', jobKey, 'maxAttempts'))
    if not attempts or not maxAttempts or attempts < 0 or attempts % 1 ~= 0
        or maxAttempts < 1 or maxAttempts > 10 or maxAttempts % 1 ~= 0
        or attempts >= maxAttempts then
        return redis.error_reply('Ready job has invalid attempt metadata; Phase 3 requires new jobs')
    end
    redis.call('RPOP', KEYS[1])
    redis.call('ZADD', KEYS[2], ARGV[1], id)
    redis.call('HSET', jobKey, 'status', 'processing',
        'workerId', ARGV[2], 'claimedAt', ARGV[1],
        'updatedAt', ARGV[1], 'claimToken', ARGV[3], 'attempts', attempts + 1)
    return redis.call('HGETALL', jobKey)
`;

const ACKNOWLEDGE = `
    local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
    if not score then return 0 end
    if redis.call('HGET', KEYS[2], 'status') ~= 'processing'
        or redis.call('HGET', KEYS[2], 'workerId') ~= ARGV[2]
        or redis.call('HGET', KEYS[2], 'claimToken') ~= ARGV[3] then
        return 0
    end
    redis.call('ZREM', KEYS[1], ARGV[1])
    redis.call('HSET', KEYS[2], 'status', 'completed', 'updatedAt', ARGV[4])
    redis.call('HDEL', KEYS[2], 'workerId', 'claimedAt', 'claimToken', 'nextRetryAt', 'failedAt')
    return 1
`;

// Both failure paths use the same policy after their own ownership/staleness
// checks. KEYS: processing, retry, dead, job. ARGV: id, now, error, base, cap.
const FAILURE_TRANSITION = `
    local attempts = tonumber(redis.call('HGET', KEYS[4], 'attempts'))
    local maxAttempts = tonumber(redis.call('HGET', KEYS[4], 'maxAttempts'))
    if not attempts or not maxAttempts or attempts < 1 or attempts % 1 ~= 0
        or maxAttempts < 1 or maxAttempts > 10 or maxAttempts % 1 ~= 0
        or attempts > maxAttempts then
        return redis.error_reply('Processing job has invalid attempt metadata')
    end
    local retryType = redis.call('TYPE', KEYS[2]).ok
    local deadType = redis.call('TYPE', KEYS[3]).ok
    if retryType ~= 'none' and retryType ~= 'zset' then
        return redis.error_reply('jobs:retry must be a sorted set')
    end
    if deadType ~= 'none' and deadType ~= 'list' then
        return redis.error_reply('jobs:dead must be a list')
    end
    local nextRetryAt = tonumber(ARGV[2]) + math.min(
        tonumber(ARGV[4]) * 2 ^ (attempts - 1), tonumber(ARGV[5]))
    redis.call('ZREM', KEYS[1], ARGV[1])
    redis.call('HSET', KEYS[4], 'lastError', ARGV[3], 'updatedAt', ARGV[2])
    redis.call('HDEL', KEYS[4], 'workerId', 'claimedAt', 'claimToken', 'nextRetryAt', 'failedAt')
    if attempts >= maxAttempts then
        redis.call('HSET', KEYS[4], 'status', 'dead', 'failedAt', ARGV[2])
        redis.call('LPUSH', KEYS[3], ARGV[1])
        return {'dead', attempts, 0}
    end
    redis.call('HSET', KEYS[4], 'status', 'retrying', 'nextRetryAt', nextRetryAt)
    redis.call('ZADD', KEYS[2], nextRetryAt, ARGV[1])
    return {'retrying', attempts, nextRetryAt}
`;

const FAIL = `
    if not redis.call('ZSCORE', KEYS[1], ARGV[1]) then return nil end
    if redis.call('HGET', KEYS[4], 'status') ~= 'processing'
        or redis.call('HGET', KEYS[4], 'workerId') ~= ARGV[6]
        or redis.call('HGET', KEYS[4], 'claimToken') ~= ARGV[7] then
        return nil
    end
` + FAILURE_TRANSITION;

const RECOVER = `
    local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
    if not score or tonumber(score) >= tonumber(ARGV[6]) then return nil end
    if redis.call('HGET', KEYS[4], 'status') ~= 'processing'
        or tonumber(redis.call('HGET', KEYS[4], 'claimedAt')) ~= tonumber(score) then
        return nil
    end
` + FAILURE_TRANSITION;

const PROMOTE_RETRY = `
    local score = redis.call('ZSCORE', KEYS[2], ARGV[1])
    if not score or tonumber(score) > tonumber(ARGV[2]) then return 0 end
    if redis.call('HGET', KEYS[3], 'status') ~= 'retrying'
        or tonumber(redis.call('HGET', KEYS[3], 'nextRetryAt')) ~= tonumber(score) then
        return redis.error_reply('Retry job has missing or invalid metadata')
    end
    local readyType = redis.call('TYPE', KEYS[1]).ok
    if readyType ~= 'none' and readyType ~= 'list' then
        return redis.error_reply('jobs:ready must be a list')
    end
    redis.call('ZREM', KEYS[2], ARGV[1])
    redis.call('HSET', KEYS[3], 'status', 'pending', 'updatedAt', ARGV[2])
    redis.call('HDEL', KEYS[3], 'nextRetryAt')
    redis.call('LPUSH', KEYS[1], ARGV[1])
    return 1
`;

module.exports = { ENQUEUE, CLAIM, ACKNOWLEDGE, FAIL, RECOVER, PROMOTE_RETRY };
