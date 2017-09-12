'use strict';

let roles = {};

roles['5615fa9ae596154a5c000000'] = {
  id: '5615fa9ae596154a5c000000',
  type: 'co-owner',
  name: 'Co-owner',
  rights: [
    'update-room',
    'set-roles',
    'set-managers',
    'skip',
    'queue-order',
    'kick',
    'ban',
    'mute',
    'set-dj',
    'lock-queue',
    'delete-chat',
    'chat-mention',
  ],
};

roles['5615fd84e596150061000003'] = {
  id: '5615fd84e596150061000003',
  type: 'manager',
  name: 'Manager',
  rights: [
    'set-roles',
    'skip',
    'queue-order',
    'kick',
    'ban',
    'mute',
    'set-dj',
    'lock-queue',
    'delete-chat',
    'chat-mention',
  ],
};

roles['52d1ce33c38a06510c000001'] = {
  id: '52d1ce33c38a06510c000001',
  type: 'mod',
  name: 'Moderator',
  rights: [
    'skip',
    'queue-order',
    'kick',
    'ban',
    'mute',
    'lock-queue',
    'delete-chat',
    'chat-mention',
  ],
};

roles['5615fe1ee596154fc2000001'] = {
  id: '5615fe1ee596154fc2000001',
  type: 'vip',
  name: 'Vip',
  rights: [
    'skip',
  ],
};

roles['resident-dj'] = roles['5615feb8e596154fc2000002'] = {
  id: '5615feb8e596154fc2000002',
  type: 'resident-dj',
  name: 'Resident DJ',
  rights: [],
};

roles['564435423f6ba174d2000001'] = {
  id: '564435423f6ba174d2000001',
  type: 'dj',
  name: 'DJ',
  rights: [],
};

roles[null] = {
  id: null,
  type: 'user',
  name: 'User',
  rights: [],
};

module.exports = roles;
