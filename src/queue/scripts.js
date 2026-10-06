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
        'status', 'pending', 'createdAt', ARGV[4], 'updatedAt', ARGV[4])
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
    redis.call('RPOP', KEYS[1])
    redis.call('ZADD', KEYS[2], ARGV[1], id)
    redis.call('HSET', jobKey, 'status', 'processing',
        'workerId', ARGV[2], 'claimedAt', ARGV[1],
        'updatedAt', ARGV[1], 'claimToken', ARGV[3])
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
    redis.call('HDEL', KEYS[2], 'workerId', 'claimedAt', 'claimToken')
    return 1
`;

const RECOVER = `
    local score = redis.call('ZSCORE', KEYS[2], ARGV[1])
    if not score or tonumber(score) >= tonumber(ARGV[2]) then return 0 end
    if redis.call('HGET', KEYS[3], 'status') ~= 'processing'
        or tonumber(redis.call('HGET', KEYS[3], 'claimedAt')) ~= tonumber(score) then
        return 0
    end
    local readyType = redis.call('TYPE', KEYS[1]).ok
    if readyType ~= 'none' and readyType ~= 'list' then
        return redis.error_reply('jobs:ready must be a list')
    end
    redis.call('ZREM', KEYS[2], ARGV[1])
    redis.call('HSET', KEYS[3], 'status', 'pending', 'updatedAt', ARGV[3])
    redis.call('HDEL', KEYS[3], 'workerId', 'claimedAt', 'claimToken')
    redis.call('LPUSH', KEYS[1], ARGV[1])
    return 1
`;

module.exports = { ENQUEUE, CLAIM, ACKNOWLEDGE, RECOVER };
