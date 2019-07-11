"use strict";

// crc32
var crc_table = [];

(function () {
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crc_table[n] = c >>> 0;
  }
})();

function update(c, buf) {
  var l = buf.length;
  for (var n = 0; n < l; n++) {
    c = crc_table[(c ^ buf[n]) & 0xff] ^ (c >>> 8);
  }
  return c;
}

function crc32( /* arguments */ ) {
  var l = arguments.length;
  var c = -1;
  for (var i = 0; i < l; i++) {
    c = update(c, Buffer.from(arguments[i]));
  }
  c = (c ^ -1) >>> 0;
  return c;
}

function pushBits(arr, n, value) {
  for (var bit = 1 << (n - 1); bit; bit = bit >>> 1) {
    arr.push(bit & value ? 1 : 0);
  }
}

// {{{1 Galois Field Math
var GF256_BASE = 285;

var EXP_TABLE = [1];
var LOG_TABLE = [];

for (var i = 1; i < 256; i++) {
    var n = EXP_TABLE[i - 1] << 1;
    if (n > 255) n = n ^ GF256_BASE;
    EXP_TABLE[i] = n;
}

for (var i = 0; i < 255; i++) {
    LOG_TABLE[EXP_TABLE[i]] = i;
}

function exp(k) {
    while (k < 0) k += 255;
    while (k > 255) k -= 255;
    return EXP_TABLE[k];
}

function log(k) {
    if (k < 1 || k > 255) {
        throw Error('Bad log(' + k + ')');
    }
    return LOG_TABLE[k];
}

// {{{1 Generator Polynomials
var POLYNOMIALS = [
    [0], // a^0 x^0
    [0, 0], // a^0 x^1 + a^0 x^0
    [0, 25, 1], // a^0 x^2 + a^25 x^1 + a^1 x^0
    // and so on...
];

function generatorPolynomial(num) {
    if (POLYNOMIALS[num]) {
        return POLYNOMIALS[num];
    }
    var prev = generatorPolynomial(num - 1);
    var res = [];

    res[0] = prev[0];
    for (var i = 1; i <= num; i++) {
        res[i] = log(exp(prev[i]) ^ exp(prev[i - 1] + num - 1));
    }
    POLYNOMIALS[num] = res;
    return res;
}

function calculateEC(msg, ec_len) {
    // `msg` could be array or buffer
    // convert `msg` to array
    msg = [].slice.call(msg);

    // Generator Polynomial
    var poly = generatorPolynomial(ec_len);

    for (var i = 0; i < ec_len; i++) msg.push(0);
    while (msg.length > ec_len) {
        if (!msg[0]) {
            msg.shift();
            continue;
        }
        var log_k = log(msg[0]);
        for (var i = 0; i <= ec_len; i++) {
            msg[i] = msg[i] ^ exp(poly[i] + log_k);
        }
        msg.shift();
    }
    return Buffer.from(msg);
}


// encode
function encode_8bit(data) {
  var len = data.length;
  var bits = [];

  for (var i = 0; i < len; i++) {
      pushBits(bits, 8, data[i]);
  }

  var res = {};

  var d = [0, 1, 0, 0];
  pushBits(d, 16, len);
  res.data10 = res.data27 = d.concat(bits);

  if (len < 256) {
      var d = [0, 1, 0, 0];
      pushBits(d, 8, len);
      res.data1 = d.concat(bits);
  }

  return res;
}

var ALPHANUM = (function (s) {
  var res = {};
  for (var i = 0; i < s.length; i++) {
    res[s[i]] = i;
  }
  return res;
})('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:');

function encode_alphanum(str) {
  var len = str.length;
  var bits = [];

  for (var i = 0; i < len; i += 2) {
    var b = 6;
    var n = ALPHANUM[str[i]];
    if (str[i + 1]) {
      b = 11;
      n = n * 45 + ALPHANUM[str[i + 1]];
    }
    pushBits(bits, b, n);
  }

  var res = {};

  var d = [0, 0, 1, 0];
  pushBits(d, 13, len);
  res.data27 = d.concat(bits);

  if (len < 2048) {
    var d = [0, 0, 1, 0];
    pushBits(d, 11, len);
    res.data10 = d.concat(bits);
  }

  if (len < 512) {
    var d = [0, 0, 1, 0];
    pushBits(d, 9, len);
    res.data1 = d.concat(bits);
  }

  return res;
}

function encode_numeric(str) {
  var len = str.length;
  var bits = [];

  for (var i = 0; i < len; i += 3) {
      var s = str.substr(i, 3);
      var b = Math.ceil(s.length * 10 / 3);
      pushBits(bits, b, parseInt(s, 10));
  }

  var res = {};

  var d = [0, 0, 0, 1];
  pushBits(d, 14, len);
  res.data27 = d.concat(bits);

  if (len < 4096) {
      var d = [0, 0, 0, 1];
      pushBits(d, 12, len);
      res.data10 = d.concat(bits);
  }

  if (len < 1024) {
      var d = [0, 0, 0, 1];
      pushBits(d, 10, len);
      res.data1 = d.concat(bits);
  }

  return res;
}

function encode_url(str) {
  var slash = str.indexOf('/', 8) + 1 || str.length;
  var res = encode(str.slice(0, slash).toUpperCase(), false);

  if (slash >= str.length) {
      return res;
  }

  var path_res = encode(str.slice(slash), false);

  res.data27 = res.data27.concat(path_res.data27);

  if (res.data10 && path_res.data10) {
      res.data10 = res.data10.concat(path_res.data10);
  }

  if (res.data1 && path_res.data1) {
      res.data1 = res.data1.concat(path_res.data1);
  }

  return res;
}

function encode(data, parse_url) {
  var str;
  var t = typeof data;

  if (t == 'string' || t == 'number') {
    str = '' + data;
    data = Buffer.from(str);
  } else if (Buffer.isBuffer(data)) {
      str = data.toString();
  } else if (Array.isArray(data)) {
      data = Buffer.from(data);
      str = data.toString();
  } else {
      throw new Error("Bad data");
  }

  if (/^[0-9]+$/.test(str)) {
      if (data.length > 7089) {
          throw new Error("Too much data");
      }
      return encode_numeric(str);
  }

  if (/^[0-9A-Z \$%\*\+\.\/\:\-]+$/.test(str)) {
      if (data.length > 4296) {
          throw new Error("Too much data");
      }
      return encode_alphanum(str);
  }

  if (parse_url && /^https?:/i.test(str)) {
      return encode_url(str);
  }

  if (data.length > 2953) {
      throw new Error("Too much data");
  }
  return encode_8bit(data);
}

// PNG
const Readable = require('stream').Readable;
const zlib = require('zlib');

var PNG_HEAD = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
var PNG_IHDR = Buffer.from([0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0]);
var PNG_IDAT = Buffer.from([0, 0, 0, 0, 73, 68, 65, 84]);
var PNG_IEND = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

function png(bitmap, stream) {
  stream.push(PNG_HEAD);

  var IHDR = Buffer.concat([PNG_IHDR]);
  IHDR.writeUInt32BE(bitmap.size, 8);
  IHDR.writeUInt32BE(bitmap.size, 12);
  IHDR.writeUInt32BE(crc32(IHDR.slice(4, -4)), 21);
  stream.push(IHDR);

  var IDAT = Buffer.concat([
    PNG_IDAT,
    zlib.deflateSync(bitmap.data, {
      level: 9
    }),
    Buffer.alloc(4)
  ]);
  IDAT.writeUInt32BE(IDAT.length - 12, 0);
  IDAT.writeUInt32BE(crc32(IDAT.slice(4, -4)), IDAT.length - 4);
  stream.push(IDAT);

  stream.push(PNG_IEND);
  stream.push(null);
}

function bitmap(matrix, size, margin) {
  var N = matrix.length;
  var X = (N + 2 * margin) * size;
  var data = Buffer.alloc((X + 1) * X);
  data.fill(255);
  for (var i = 0; i < X; i++) {
    data[i * (X + 1)] = 0;
  }

  for (var i = 0; i < N; i++) {
    for (var j = 0; j < N; j++) {
      if (matrix[i][j]) {
        var offset = ((margin + i) * (X + 1) + (margin + j)) * size + 1;
        data.fill(0, offset, offset + size);
        for (var c = 1; c < size; c++) {
          data.copy(data, offset + c * (X + 1), offset, offset + size);
        }
      }
    }
  }

  return {
    data: data,
    size: X
  }
}

function init(version) {
  var N = version * 4 + 17;
  var matrix = [];
  var zeros = Buffer.alloc(N);
  zeros.fill(0);
  zeros = [].slice.call(zeros);
  for (var i = 0; i < N; i++) {
      matrix[i] = zeros.slice();
  }
  return matrix;
}

// {{{1 Put finders into matrix
function fillFinders(matrix) {
  var N = matrix.length;
  for (var i = -3; i <= 3; i++) {
      for (var j = -3; j <= 3; j++) {
          var max = Math.max(i, j);
          var min = Math.min(i, j);
          var pixel = (max == 2 && min >= -2) || (min == -2 && max <= 2) ? 0x80 : 0x81;
          matrix[3 + i][3 + j] = pixel;
          matrix[3 + i][N - 4 + j] = pixel;
          matrix[N - 4 + i][3 + j] = pixel;
      }
  }
  for (var i = 0; i < 8; i++) {
      matrix[7][i] = matrix[i][7] =
      matrix[7][N - i - 1] = matrix[i][N - 8] =
      matrix[N - 8][i] = matrix[N - 1 - i][7] = 0x80;
  }
}

// {{{1 Put align and timinig
function fillAlignAndTiming(matrix) {
  var N = matrix.length;
  if (N > 21) {
      var len = N - 13;
      var delta = Math.round(len / Math.ceil(len / 28));
      if (delta % 2) delta++;
      var res = [];
      for (var p = len + 6; p > 10; p -= delta) {
          res.unshift(p);
      }
      res.unshift(6);
      for (var i = 0; i < res.length; i++) {
          for (var j = 0; j < res.length; j++) {
              var x = res[i], y = res[j];
              if (matrix[x][y]) continue;
              for (var r = -2; r <=2 ; r++) {
                  for (var c = -2; c <=2 ; c++) {
                      var max = Math.max(r, c);
                      var min = Math.min(r, c);
                      var pixel = (max == 1 && min >= -1) || (min == -1 && max <= 1) ? 0x80 : 0x81;
                      matrix[x + r][y + c] = pixel;
                  }
              }
          }
      }
  }
  for (var i = 8; i < N - 8; i++) {
      matrix[6][i] = matrix[i][6] = i % 2 ? 0x80 : 0x81;
  }
}

// {{{1 Fill reserved areas with zeroes
function fillStub(matrix) {
  var N = matrix.length;
  for (var i = 0; i < 8; i++) {
      if (i != 6) {
          matrix[8][i] = matrix[i][8] = 0x80;
      }
      matrix[8][N - 1 - i] = 0x80;
      matrix[N - 1 - i][8] = 0x80;
  }
  matrix[8][8] = 0x80;
  matrix[N - 8][8] = 0x81;

  if (N < 45) return;

  for (var i = N - 11; i < N - 8; i++) {
      for (var j = 0; j < 6; j++) {
          matrix[i][j] = matrix[j][i] = 0x80;
      }
  }
}

// {{{1 Fill reserved areas
var fillReserved = (function() {
  var FORMATS = Array(32);
  var VERSIONS = Array(40);

  var gf15 = 0x0537;
  var gf18 = 0x1f25;
  var formats_mask = 0x5412;

  for (var format = 0; format < 32; format++) {
      var res = format << 10;
      for (var i = 5; i > 0; i--) {
          if (res >>> (9 + i)) {
              res = res ^ (gf15 << (i - 1));
          }
      }
      FORMATS[format] = (res | (format << 10)) ^ formats_mask;
  }

  for (var version = 7; version <= 40; version++) {
      var res = version << 12;
      for (var i = 6; i > 0; i--) {
          if (res >>> (11 + i)) {
              res = res ^ (gf18 << (i - 1));
          }
      }
      VERSIONS[version] = (res | (version << 12));
  }

  var EC_LEVELS = { L: 1, M: 0, Q: 3, H: 2 };

  return function fillReserved(matrix, ec_level, mask) {
      var N = matrix.length;
      var format = FORMATS[EC_LEVELS[ec_level] << 3 | mask];
      function F(k) { return format >> k & 1 ? 0x81 : 0x80 };
      for (var i = 0; i < 8; i++) {
          matrix[8][N - 1 - i] = F(i);
          if (i < 6) matrix[i][8] = F(i);
      }
      for (var i = 8; i < 15; i++) {
          matrix[N - 15 + i][8] = F(i);
          if (i > 8) matrix[8][14 - i] = F(i);
      }
      matrix[7][8] = F(6);
      matrix[8][8] = F(7);
      matrix[8][7] = F(8);

      var version = VERSIONS[(N - 17)/4];
      if (!version) return;
      function V(k) { return version >> k & 1 ? 0x81 : 0x80 };
      for (var i = 0; i < 6; i++) {
          for (var j = 0; j < 3; j++) {
              matrix[N - 11 + j][i] = matrix[i][N - 11 + j] = V(i * 3 + j);
          }
      }
  }
})();

// {{{1 Fill data
var fillData = (function() {
  var MASK_FUNCTIONS = [
      function(i, j) { return (i + j) % 2 == 0 },
      function(i, j) { return i % 2 == 0 },
      function(i, j) { return j % 3 == 0 },
      function(i, j) { return (i + j) % 3 == 0 },
      function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0 },
      function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0 },
      function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0 },
      function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0 }
  ];

  return function fillData(matrix, data, mask) {
      var N = matrix.length;
      var row, col, dir = -1;
      row = col = N - 1;
      var mask_fn = MASK_FUNCTIONS[mask];
      var len = data.blocks[data.blocks.length - 1].length;

      for (var i = 0; i < len; i++) {
          for (var b = 0; b < data.blocks.length; b++) {
              if (data.blocks[b].length <= i) continue;
              put(data.blocks[b][i]);
          }
      }

      len = data.ec_len;
      for (var i = 0; i < len; i++) {
          for (var b = 0; b < data.ec.length; b++) {
              put(data.ec[b][i]);
          }
      }

      if (col > -1) {
          do {
              matrix[row][col] = mask_fn(row, col) ? 1 : 0;
          } while (next());
      }

      function put(byte) {
          for (var mask = 0x80; mask; mask = mask >> 1) {
              var pixel = !!(mask & byte);
              if (mask_fn(row, col)) pixel = !pixel;
              matrix[row][col] = pixel ? 1 : 0;
              next();
          }
      }

      function next() {
          do {
              if ((col % 2) ^ (col < 6)) {
                  if (dir < 0 && row == 0 || dir > 0 && row == N - 1) {
                      col--;
                      dir = -dir;
                  } else {
                      col++;
                      row += dir;
                  }
              } else {
                  col--;
              }
              if (col == 6) {
                  col--;
              }
              if (col < 0) {
                  return false;
              }
          } while (matrix[row][col] & 0xf0);
          return true;
      }
  }
})();

// {{{1 Calculate penalty
function calculatePenalty(matrix) {
  var N = matrix.length;
  var penalty = 0;
  // Rule 1
  for (var i = 0; i < N; i++) {
      var pixel = matrix[i][0] & 1;
      var len = 1;
      for (var j = 1; j < N; j++) {
          var p = matrix[i][j] & 1;
          if (p == pixel) {
              len++;
              continue;
          }
          if (len >= 5) {
              penalty += len - 2;
          }
          pixel = p;
          len = 1;
      }
      if (len >= 5) {
          penalty += len - 2;
      }
  }
  for (var j = 0; j < N; j++) {
      var pixel = matrix[0][j] & 1;
      var len = 1;
      for (var i = 1; i < N; i++) {
          var p = matrix[i][j] & 1;
          if (p == pixel) {
              len++;
              continue;
          }
          if (len >= 5) {
              penalty += len - 2;
          }
          pixel = p;
          len = 1;
      }
      if (len >= 5) {
          penalty += len - 2;
      }
  }

  // Rule 2
  for (var i = 0; i < N - 1; i++) {
      for (var j = 0; j < N - 1; j++) {
          var s = matrix[i][j] + matrix[i][j + 1] + matrix[i + 1][j] + matrix[i + 1][j + 1] & 7;
          if (s == 0 || s == 4) {
              penalty += 3;
          }
      }
  }

  // Rule 3
  function I(k) { return matrix[i][j + k] & 1 };
  function J(k) { return matrix[i + k][j] & 1 };
  for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) {
          if (j < N - 6 && I(0) && !I(1) && I(2) && I(3) && I(4) && !I(5) && I(6)) {
              if (j >= 4 && !(I(-4) || I(-3) || I(-2) || I(-1))) {
                  penalty += 40;
              }
              if (j < N - 10 && !(I(7) || I(8) || I(9) || I(10))) {
                  penalty += 40;
              }
          }

          if (i < N - 6 && J(0) && !J(1) && J(2) && J(3) && J(4) && !J(5) && J(6)) {
              if (i >= 4 && !(J(-4) || J(-3) || J(-2) || J(-1))) {
                  penalty += 40;
              }
              if (i < N - 10 && !(J(7) || J(8) || J(9) || J(10))) {
                  penalty += 40;
              }
          }
      }
  }

  // Rule 4
  var numDark = 0;
  for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) {
          if (matrix[i][j] & 1) numDark++;
      }
  }
  penalty += 10 * Math.floor(Math.abs(10 - 20 * numDark/(N * N)));

  return penalty;
}

// {{{1 All-in-one function
function getMatrix(data) {
  var matrix = init(data.version);
  fillFinders(matrix);
  fillAlignAndTiming(matrix);
  fillStub(matrix);

  var penalty = Infinity;
  var bestMask = 0;
  for (var mask = 0; mask < 8; mask++) {
      fillData(matrix, data, mask);
      fillReserved(matrix, data.ec_level, mask);
      var p = calculatePenalty(matrix);
      if (p < penalty) {
          penalty = p;
          bestMask = mask;
      }
  }

  fillData(matrix, data, bestMask);
  fillReserved(matrix, data.ec_level, bestMask);

  return matrix.map(function(row) {
      return row.map(function(cell) {
          return cell & 1;
      });
  });
}

// QR
var versions = JSON.parse('[null,{"version":1,"ec_level":"M","data_len":16,"ec_len":10,"blocks":[16],"ec":[]},{"version":2,"ec_level":"M","data_len":28,"ec_len":16,"blocks":[28],"ec":[]},{"version":3,"ec_level":"M","data_len":44,"ec_len":26,"blocks":[44],"ec":[]},{"version":4,"ec_level":"M","data_len":64,"ec_len":18,"blocks":[32,32],"ec":[]},{"version":5,"ec_level":"M","data_len":86,"ec_len":24,"blocks":[43,43],"ec":[]},{"version":6,"ec_level":"M","data_len":108,"ec_len":16,"blocks":[27,27,27,27],"ec":[]},{"version":7,"ec_level":"M","data_len":124,"ec_len":18,"blocks":[31,31,31,31],"ec":[]},{"version":8,"ec_level":"M","data_len":154,"ec_len":22,"blocks":[38,38,39,39],"ec":[]},{"version":9,"ec_level":"M","data_len":182,"ec_len":22,"blocks":[36,36,36,37,37],"ec":[]},{"version":10,"ec_level":"M","data_len":216,"ec_len":26,"blocks":[43,43,43,43,44],"ec":[]},{"version":11,"ec_level":"M","data_len":254,"ec_len":30,"blocks":[50,51,51,51,51],"ec":[]},{"version":12,"ec_level":"M","data_len":290,"ec_len":22,"blocks":[36,36,36,36,36,36,37,37],"ec":[]},{"version":13,"ec_level":"M","data_len":334,"ec_len":22,"blocks":[37,37,37,37,37,37,37,37,38],"ec":[]},{"version":14,"ec_level":"M","data_len":365,"ec_len":24,"blocks":[40,40,40,40,41,41,41,41,41],"ec":[]},{"version":15,"ec_level":"M","data_len":415,"ec_len":24,"blocks":[41,41,41,41,41,42,42,42,42,42],"ec":[]},{"version":16,"ec_level":"M","data_len":453,"ec_len":28,"blocks":[45,45,45,45,45,45,45,46,46,46],"ec":[]},{"version":17,"ec_level":"M","data_len":507,"ec_len":28,"blocks":[46,46,46,46,46,46,46,46,46,46,47],"ec":[]},{"version":18,"ec_level":"M","data_len":563,"ec_len":26,"blocks":[43,43,43,43,43,43,43,43,43,44,44,44,44],"ec":[]},{"version":19,"ec_level":"M","data_len":627,"ec_len":26,"blocks":[44,44,44,45,45,45,45,45,45,45,45,45,45,45],"ec":[]},{"version":20,"ec_level":"M","data_len":669,"ec_len":26,"blocks":[41,41,41,42,42,42,42,42,42,42,42,42,42,42,42,42],"ec":[]},{"version":21,"ec_level":"M","data_len":714,"ec_len":26,"blocks":[42,42,42,42,42,42,42,42,42,42,42,42,42,42,42,42,42],"ec":[]},{"version":22,"ec_level":"M","data_len":782,"ec_len":28,"blocks":[46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46],"ec":[]},{"version":23,"ec_level":"M","data_len":860,"ec_len":28,"blocks":[47,47,47,47,48,48,48,48,48,48,48,48,48,48,48,48,48,48],"ec":[]},{"version":24,"ec_level":"M","data_len":914,"ec_len":28,"blocks":[45,45,45,45,45,45,46,46,46,46,46,46,46,46,46,46,46,46,46,46],"ec":[]},{"version":25,"ec_level":"M","data_len":1000,"ec_len":28,"blocks":[47,47,47,47,47,47,47,47,48,48,48,48,48,48,48,48,48,48,48,48,48],"ec":[]},{"version":26,"ec_level":"M","data_len":1062,"ec_len":28,"blocks":[46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,47,47,47,47],"ec":[]},{"version":27,"ec_level":"M","data_len":1128,"ec_len":28,"blocks":[45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,46,46,46],"ec":[]},{"version":28,"ec_level":"M","data_len":1193,"ec_len":28,"blocks":[45,45,45,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46],"ec":[]},{"version":29,"ec_level":"M","data_len":1267,"ec_len":28,"blocks":[45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,46,46,46,46,46,46,46],"ec":[]},{"version":30,"ec_level":"M","data_len":1373,"ec_len":28,"blocks":[47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,48,48,48,48,48,48,48,48,48,48],"ec":[]},{"version":31,"ec_level":"M","data_len":1455,"ec_len":28,"blocks":[46,46,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47],"ec":[]},{"version":32,"ec_level":"M","data_len":1541,"ec_len":28,"blocks":[46,46,46,46,46,46,46,46,46,46,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47],"ec":[]},{"version":33,"ec_level":"M","data_len":1631,"ec_len":28,"blocks":[46,46,46,46,46,46,46,46,46,46,46,46,46,46,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47],"ec":[]},{"version":34,"ec_level":"M","data_len":1725,"ec_len":28,"blocks":[46,46,46,46,46,46,46,46,46,46,46,46,46,46,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47],"ec":[]},{"version":35,"ec_level":"M","data_len":1812,"ec_len":28,"blocks":[47,47,47,47,47,47,47,47,47,47,47,47,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48],"ec":[]},{"version":36,"ec_level":"M","data_len":1914,"ec_len":28,"blocks":[47,47,47,47,47,47,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48],"ec":[]},{"version":37,"ec_level":"M","data_len":1992,"ec_len":28,"blocks":[46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,46,47,47,47,47,47,47,47,47,47,47,47,47,47,47],"ec":[]},{"version":38,"ec_level":"M","data_len":2102,"ec_len":28,"blocks":[46,46,46,46,46,46,46,46,46,46,46,46,46,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47],"ec":[]},{"version":39,"ec_level":"M","data_len":2216,"ec_len":28,"blocks":[47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,48,48,48,48,48,48,48],"ec":[]},{"version":40,"ec_level":"M","data_len":2334,"ec_len":28,"blocks":[47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48,48],"ec":[]}]')

function _deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getTemplate(message) {
  var i = 1;
  var len;

  if (message.data1) {
      len = Math.ceil(message.data1.length / 8);
  } else {
      i = 10;
  }
  for (/* i */; i < 10; i++) {
      var version = versions[i];
      if (version.data_len >= len) {
          return _deepCopy(version);
      }
  }

  if (message.data10) {
      len = Math.ceil(message.data10.length / 8);
  } else {
      i = 27;
  }
  for (/* i */; i < 27; i++) {
      var version = versions[i];
      if (version.data_len >= len) {
          return _deepCopy(version);
      }
  }

  len = Math.ceil(message.data27.length / 8);
  for (/* i */; i < 41; i++) {
      var version = versions[i];
      if (version.data_len >= len) {
          return _deepCopy(version);
      }
  }
  throw new Error("Too much data");
}

// {{{1 Fill template
function fillTemplate(message, template) {
  var blocks = Buffer.alloc(template.data_len);
  blocks.fill(0);

  if (template.version < 10) {
      message = message.data1;
  } else if (template.version < 27) {
      message = message.data10;
  } else {
      message = message.data27;
  }

  var len = message.length;

  for (var i = 0; i < len; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) {
          b = (b << 1) | (message[i + j] ? 1 : 0);
      }
      blocks[i / 8] = b;
  }

  var pad = 236;
  for (var i = Math.ceil((len + 4) / 8); i < blocks.length; i++) {
      blocks[i] = pad;
      pad = (pad == 236) ? 17 : 236;
  }

  var offset = 0;
  template.blocks = template.blocks.map(function(n) {
      var b = blocks.slice(offset, offset + n);
      offset += n;
      template.ec.push(calculateEC(b, template.ec_len));
      return b;
  });

  return template;
}

// {{{1 All-in-one
function QR(text, ec_level) {
  var message = encode(text);
  var data = fillTemplate(message, getTemplate(message));
  return getMatrix(data);
}

function qr_image(text, size = 5) {
  var matrix = QR(text, 5);
  var stream = new Readable();
  stream._read = function () {};

  process.nextTick(function () {
    var _bitmap = bitmap(matrix, size, 4);
    png(_bitmap, stream);
  });

  return stream;
}

module.exports = {
  image: qr_image
};