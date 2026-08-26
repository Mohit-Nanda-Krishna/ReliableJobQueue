const queue = [];

function enqueue(job) {
    queue.push(job);
}

function dequeue() {
    return queue.shift();
}

module.exports = {enqueue, dequeue};