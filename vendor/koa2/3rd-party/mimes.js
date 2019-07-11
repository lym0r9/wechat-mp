'use strict';

const mime = require('mime-types');
const LRU = require('ylru');

const typeLRUCache = new LRU(100);

module.exports = type => {
  let mimeType = typeLRUCache.get(type);
  if (!mimeType) {
    mimeType = type.indexOf('/') === -1
      ? mime.lookup(type)
      : type
    typeLRUCache.set(type, mimeType);
  }
  return mimeType;
};