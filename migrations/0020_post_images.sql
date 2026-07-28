-- Migration number: 0020    Single image attachments for posts and messages

ALTER TABLE threads ADD COLUMN image_key TEXT;
ALTER TABLE posts ADD COLUMN image_key TEXT;
ALTER TABLE private_messages ADD COLUMN image_key TEXT;
