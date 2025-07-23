#!/bin/bash

# Script to delete corrupted Redis session
# Usage: ./delete-corrupted-session.sh

REDIS_PASSWORD="flash_redis_secure_pass"
SESSION_KEY="session:f950b1fa027a824a3e058eebbf8e90cd"

echo "🔍 Deleting corrupted session: $SESSION_KEY"

# Delete the session
redis-cli -a "$REDIS_PASSWORD" DEL "$SESSION_KEY" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Session deleted successfully"
    
    # Also try to delete any related mappings
    echo "🔍 Cleaning up related mappings..."
    redis-cli -a "$REDIS_PASSWORD" EVAL "
        local keys = redis.call('keys', 'session:mapping:*')
        local deleted = 0
        for i=1,#keys do
            local value = redis.call('get', keys[i])
            if value == ARGV[1] then
                redis.call('del', keys[i])
                deleted = deleted + 1
            end
        end
        return deleted
    " 0 "$SESSION_KEY" 2>/dev/null
    
    echo "✅ Cleanup complete"
else
    echo "❌ Failed to delete session"
fi