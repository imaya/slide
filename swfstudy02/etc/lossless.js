/**
 * original source code:
 *   https://github.com/Moncader/QuickSWF/blob/master/src/tags/lossless.js
 * @author Yuta Imaya
 * Copyright (C) 2012 Yuta Imaya.
 */
(function(global) {
  var USE_TYPEDARRAY = (global.Uint8Array !== void 0);
  var USE_BLOBCONSTRUCTOR = false;
  try {
    var blob = new Blob();
    USE_BLOBCONSTRUCTOR = true;
  } catch(e){}

  /** @const @type {number} */
  var mBlockSize = 0x7fff;

  global.decodeLossless2Canvas = defineBitsLossless2Canvas;
  global.decodeLossless2Image  = defineBitsLossless2Image;

  /**
   * @param {!(Array.<number>|Uint8Array)} data
   * @return {HTMLCanvasElement}
   */
  function defineBitsLossless2Canvas(data) {
    /** @type {Lossless2} */
    var tLossless = new Lossless2();

    tLossless.parse(data);

    return tLossless.getCanvas();
  }

  /**
   * @param {!(Array.<number>|Uint8Array)} data
   * @return {HTMLImageElement}
   */
  function defineBitsLossless2Image(data) {
    /** @type {Lossless2} */
    var tLossless = new Lossless2();

    tLossless.parse(data);

    return tLossless.getImage();
  }

  /**
   * @enum {number}
   */
  var LosslessFormat = {
    COLOR_MAPPED: 3,
    RGB15: 4,
    RGB24: 5
  };

  /**
   * @enum {number}
   */
  var PngColourType = {
    GRAYSCALE: 0,
    TRUECOLOR: 2,
    INDEXED_COLOR: 3,
    GRAYSCALE_WITH_ALPHA: 4,
    TRUECOLOR_WITH_ALPHA: 6
  };

  /**
   * lossless image parser.
   * @constructor
   */
  function Lossless2() {
    /** @type {number} */
    this.id;
    /** @type {number} */
    this.size;
    /** @type {number} */
    this.width;
    /** @type {number} */
    this.height;
    /** @type {!(Array.<number>|Uint8Array)} */
    this.plain;
    /** @type {LosslessFormat} */
    this.format;
    /** @type {PngColourType} */
    this.colourType;
    /** @type {!(Array.<number>|Uint8Array)} */
    this.palette;
    /** @type {!Uint8Array} */
    this.png;
    /** @type {number} */
    this.pp = 0;
    /** @type {number} */
    this.withAlpha = 1;
  }



  /**
   * parse lossless image.
   * @param {!(Array.<number>|Uint8Array)} data
   */
  Lossless2.prototype.parse = function(data) {
    /** @type {!(Array.<number>|Uint8Array)} */
    var input = data;
    /** @type {number} */
    var ip = 0;
    /** @type {number} */
    var id = (input[ip++]) | (input[ip++] << 8);
    /** @type {LosslessFormat} */
    var tFormat = this.format = input[ip++];
    /** @type {number} */
    var tPaletteSize;
    /** @type {Uint8Array} */
    var tPalette;
    /** @type {number} */
    var tPp = 0;
    /** @type {number} */
    var tTp = 0;
    /** @type {Uint8Array} */
    var tTmpPalette;
    /** @type {Uint8Array} */
    var tTrns;
    /** @type {number} */
    var alpha;
    /** @type {number} */
    var bufferSize;

    this.id = id;
    this.size = data.length - (2 + 1 + 2 + 2);
    this.width = (input[ip++]) | (input[ip++] << 8);
    this.height = (input[ip++]) | (input[ip++] << 8);

    // indexed-color
    if (tFormat === LosslessFormat.COLOR_MAPPED) {
      this.colourType = PngColourType.INDEXED_COLOR;

      // palette
      tPaletteSize = (input[ip++] + 1);
      tTrns = this.trns = new (USE_TYPEDARRAY ? Uint8Array : Array)(tPaletteSize);
      tPaletteSize *= 4;
      --this.size;

      // buffer size
      bufferSize = tPaletteSize +
        /* width with padding * height */((this.width + 3) & -4) * this.height;
    // truecolor
    } else {
      this.colourType = PngColourType.TRUECOLOR_WITH_ALPHA;

      // buffer size
      bufferSize = 4 * this.width * this.height;
    }

    // compressed image data
    this.plain = new Zlib.Inflate(
      USE_TYPEDARRAY ?
        input.subarray(ip, ip += this.size) :
        input.slice(ip, ip += this.size),
      {
        bufferSize: bufferSize
      }
    ).decompress();

    // palette
    if (tFormat === LosslessFormat.COLOR_MAPPED) {
      // RGB palette
      if (!this.withAlpha) {
        this.palette = (
          this.plain instanceof Array ?
          this.plain.slice(0, tPaletteSize) :
          this.plain.subarray(0, tPaletteSize)
        );
      // RGBA palette
      } else {
        tTmpPalette = (
          this.plain instanceof Array ?
          this.plain.slice(0, tPaletteSize) :
          this.plain.subarray(0, tPaletteSize)
        );
        tPalette = this.palette = new (USE_TYPEDARRAY ? Uint8Array : Array)(tPaletteSize * 3 / 4);

        for (var i = 0; i < tPaletteSize; i += 4) {
          alpha = tTrns[tTp++] = tTmpPalette[i + 3];
          tPalette[tPp++] = tTmpPalette[i    ] * 255 / alpha | 0; // red
          tPalette[tPp++] = tTmpPalette[i + 1] * 255 / alpha | 0; // green
          tPalette[tPp++] = tTmpPalette[i + 2] * 255 / alpha | 0; // blue
        }
      }
      this.plain = (
        USE_TYPEDARRAY ?
        new Uint8Array(this.plain.buffer, tPaletteSize, this.plain.length - tPaletteSize) :
        this.plain.slice(tPaletteSize, this.plain.length)
      );
    }
  };
  /**
   * create new Image element.
   * @return {HTMLImageElement} img element.
   */
  Lossless2.prototype.getImage = function() {
    /** @type {HTMLImageElement} */
    var tImage = new Image();
    /** @type {Uint8Array} */
    var tPng = this.getPNG();
    /** @type {Blob} */
    var tBlob;
    /** @type {Object} */
    var tUrl = global.URL || global.webkitURL;

    // blob constuctor
    if (USE_BLOBCONSTRUCTOR) {
      tBlob = new Blob([tPng.buffer], {type: 'image/png'});
      tImage.src = tUrl.createObjectURL(tBlob);
      tUrl.revokeObjectURL(tImage.src);
    // blob builder
    } else if (window.WebKitBlobBuilder !== void 0 && USE_TYPEDARRAY) {
      var bb = new WebKitBlobBuilder();

      bb.append(tPng.buffer);
      tBlob = bb.getBlob('image/png');
      tImage.src = tUrl.createObjectURL(tBlob);
      tUrl.revokeObjectURL(tImage.src);
    // data url
    } else {
      tImage.src = 'data:image/png;base64,' + window.btoa(byteArray2byteString(tPng));
    }

    return tImage;
  };

  /**
   * create new Canvas element.
   * @return {HTMLCanvasElement}
   */
  Lossless2.prototype.getCanvas = function() {
    /** @type {HTMLCanvasElement} */
    var tCanvas = document.createElement('canvas');
    /** @type {CanvasRenderingContext2D} */
    var tContext = tCanvas.getContext('2d');
    /** @type {ImageData} */
    var tImageData;
    /** @type {!(CanvasPixelArray|Uint8ClampedArray)} */
    var tPixelArray;
    /** @type {LosslessFormat} */
    var tFormat = this.format;
    /** @type {number} */
    var tWidthWithPadding;
    /** @type {number} */
    var tOp = 0;
    /** @type {number} */
    var tIp = 0;
    /** @type {number} */
    var tPlain = this.plain;
    /** @type {number} */
    var tLength;
    /** @type {number} */
    var tX;
    /** @type {number} */
    var tWidth = this.width;
    /** @type {number} */
    var tIndex;
    /** @type {number} */
    var tAlpha;
    /** @type {number} */
    var tReserved;
    /** @type {!(Array.<number>|Uint8Array)} */
    var tPalette = this.palette;
    /** @type {!(Array.<number>|Uint8Array)} */
    var tTrns = this.trns;

    tCanvas.width = this.width;
    tCanvas.height = this.height;

    tImageData = tContext.getImageData(0, 0, this.width, this.height);
    tPixelArray = tImageData.data;
    tLength = tPixelArray.length;

    // Colormapped
    if (tFormat === LosslessFormat.COLOR_MAPPED) {
      // set RGBA
      tWidthWithPadding = (tWidth + 3) & -4;
      while (tOp < tLength) {
        // write color-map index
        for (tX = 0; tX < tWidth; ++tX) {
          tIndex = tPlain[tIp + tX] * 3;
          tPixelArray[tOp++] = tPalette[tIndex    ];
          tPixelArray[tOp++] = tPalette[tIndex + 1];
          tPixelArray[tOp++] = tPalette[tIndex + 2];
          tPixelArray[tOp++] = this.withAlpha ? tTrns[tIndex / 3] : 255;
        }

        // next
        tIp += tWidthWithPadding;
      }
    // Direct
    } else {
      while (tOp < tLength) {
        // set RGBA
        if (tFormat === LosslessFormat.RGB24) {
          if (this.withAlpha) {
            tAlpha = tPlain[tIp++];
            tPixelArray[tOp++] = tPlain[tIp++] * 255 / tAlpha | 0;
            tPixelArray[tOp++] = tPlain[tIp++] * 255 / tAlpha | 0;
            tPixelArray[tOp++] = tPlain[tIp++] * 255 / tAlpha | 0;
            tPixelArray[tOp++] = tAlpha;
          } else {
            tIp++;
            tPixelArray[tOp++] = tPlain[tIp++];
            tPixelArray[tOp++] = tPlain[tIp++];
            tPixelArray[tOp++] = tPlain[tIp++];
            tPixelArray[tOp++] = 255;
          }
        } else if (tFormat === LosslessFormat.RGB15) {
          tReserved = (tPlain[tIp++] << 8) | tPlain[tIp++];
          tPixelArray[tOp++] = (tReserved >> 7) & 0xf8; // >> 10 << 3, 0x1f << 3
          tPixelArray[tOp++] = (tReserved >> 2) & 0xf8; // >> 5  << 3, 0x1f << 3
          tPixelArray[tOp++] = (tReserved << 3) & 0xf8; //       << 3, 0x1f << 3
          tPixelArray[tOp++] = 255;
        } else {
          throw new Error('unknown format: ' + tFormat);
        }
      }
    }

    tContext.putImageData(tImageData, 0, 0);

    return tCanvas;
  };

  /**
   * @return {number}
   */
  Lossless2.prototype.calcBufferSize = function() {
    /** @type {number} */
    var size = 0;
    /** @type {number} */
    var pixelWidth;
    /** @type {number} */
    var imageSize;

    // PNG Signature
    size += 8;

    // IHDR
    size += /* IHDR data */ 13 + /* chunk */ 12;

    // PLTE
    if (this.colourType === PngColourType.INDEXED_COLOR) {
      size += /* PLTE data */ this.palette.length + /* chunk */ 12;

      // tRNS
      if (this.withAlpha) {
        size += /* tRNS data */ this.trns.length + /* chunk */ 12;
      }

      pixelWidth = 1;
    } else {
      pixelWidth = this.withAlpha ? 4 : 3;
    }

    // IDAT
    imageSize = (this.width * pixelWidth + /* filter */ 1) * this.height;
    size += ( /* ZLIB non-compressed */
      /* cmf    */ 1 +
      /* flg    */ 1 +
      /* data   */ imageSize +
      /* header */ (
      (/* bfinal, btype */ 1 +
        /* len           */ 2 +
        /* nlen          */ 2) *
        /* number of blocks */ (1 + (imageSize / mBlockSize | 0))
      ) +
      /* adler  */ 4
      ) + 12;

    // IEND
    size += /* chunk*/ 12;

    return size;
  };

  /**
   * create PNG buffer.
   * @return {!Uint8Array} png bytearray.
   */
  Lossless2.prototype.getPNG = function() {
    /** @type {number} */
    var tBufferSize = this.calcBufferSize();

    /** @type {Uint8Array} */
    this.png = (
      USE_TYPEDARRAY ?
      new Uint8Array(tBufferSize) :
      //new Array(tBufferSize)
      new Array(tBufferSize > 0xffff ? 0xffff : tBufferSize)
    );

    this.png.set = function(src, opt_pos) {
      /** @type {number} */
      var i;
      /** @type {number} */
      var il;

      if (typeof opt_pos !== 'number') {
        opt_pos = 0;
      }

      for (i = 0, il = src.length; i < il; ++i) {
        this[opt_pos + i] = src[i];
      }
    };

    this.writeSignature();
    this.writeIHDR();
    if (this.format === LosslessFormat.COLOR_MAPPED) {
      this.writePLTE();
      if (this.withAlpha) {
        this.writeTRNS();
      }
    }
    this.writeIDAT();
    this.writeIEND();
    this.finish();

    return this.png;
  };

  /**
   * truncate output buffer.
   * @return {Uint8Array} png bytearray.
   */
  Lossless2.prototype.finish = function() {
    if (this.png.length > this.pp) {
      if (USE_TYPEDARRAY) {
        this.png = this.png.subarray(0, this.pp);
      } else {
        this.png.length = this.pp;
      }
    }

    return this.png;
  };

  /**
   * write png signature.
   */
  Lossless2.prototype.writeSignature = function() {
    /** @const @type {Array.<number>} */
    var signature = [137, 80, 78, 71, 13, 10, 26, 10];

    if (USE_TYPEDARRAY) {
      this.png.set(signature, this.pp);
    } else {
      this.set(this.png, signature, this.pp);
    }
    this.pp += 8;
  };

  /**
   * @param {!(Array.<number>|Uint8Array)} dst
   * @param {!(Array.<number>|Uint8Array)} src
   * @param {number=} opt_pos
   */
  Lossless2.prototype.set = function(dst, src, opt_pos) {
    /** @type {number} */
    var i;
    /** @type {number} */
    var il;

    if (typeof opt_pos !== 'number') {
      opt_pos = 0;
    }

    for (i = 0, il = src.length; i < il; ++i) {
      dst[opt_pos + i] = src[i];
    }
  };

  /**
   * write png chunk.
   * @type {string} pType chunk type.
   * @type {!(Array.<number>|Uint8Array)} pData chunk data.
   */
  Lossless2.prototype.writeChunk = function(pType, pData) {
    /** @type {number} */
    var tDataLength = pData.length;
    /** @type {Array.<number>} */
    var tTypeArray = [
      pType.charCodeAt(0) & 0xff, pType.charCodeAt(1) & 0xff,
      pType.charCodeAt(2) & 0xff, pType.charCodeAt(3) & 0xff
    ];
    /** @type {number} */
    var tCrc32;

    var tPng = this.png;
    var tPp = this.pp;

    // length
    tPng[tPp++] = (tDataLength >> 24) & 0xff;
    tPng[tPp++] = (tDataLength >> 16) & 0xff;
    tPng[tPp++] = (tDataLength >>  8) & 0xff;
    tPng[tPp++] = (tDataLength      ) & 0xff;

    // type
    tPng[tPp++] = tTypeArray[0];
    tPng[tPp++] = tTypeArray[1];
    tPng[tPp++] = tTypeArray[2];
    tPng[tPp++] = tTypeArray[3];

    // data
    if (USE_TYPEDARRAY) {
      tPng.set(pData, tPp);
    } else {
      this.set(tPng, pData, tPp);
    }
    tPp += tDataLength;

    // crc32
    tCrc32 = Zlib.CRC32.update(pData, Zlib.CRC32.calc(tTypeArray));
    tPng[tPp++] = (tCrc32 >> 24) & 0xff;
    tPng[tPp++] = (tCrc32 >> 16) & 0xff;
    tPng[tPp++] = (tCrc32 >>  8) & 0xff;
    tPng[tPp++] = (tCrc32      ) & 0xff;

    this.pp = tPp;
  };

  /**
   * write PNG IHDR chunk.
   */
  Lossless2.prototype.writeIHDR = function() {
    /** @type {number} */
    var tWidth = this.width;
    /** @type {number} */
    var tHeight = this.height;
    /** @type {PngColourType} */
    var tColourType = this.colourType;

    this.writeChunk('IHDR', [
      /* width */
      (tWidth  >> 24) & 0xff, (tWidth  >> 16) & 0xff,
      (tWidth  >>  8) & 0xff, (tWidth       ) & 0xff,
      /* height */
      (tHeight >> 24) & 0xff, (tHeight >> 16) & 0xff,
      (tHeight >>  8) & 0xff, (tHeight      ) & 0xff,
      /* bit depth   */ 8,
      /* colour type */ tColourType,
      /* compression */ 0,
      /* filter      */ 0,
      /* interlace   */ 0
    ]);
  };

  /**
   * write PNG PLTE chunk.
   */
  Lossless2.prototype.writePLTE = function() {
    this.writeChunk('PLTE', this.palette);
  };

  /**
   * write PNG tRNS chunk.
   */
  Lossless2.prototype.writeTRNS = function() {
    this.writeChunk('tRNS', this.trns);
  };

  /**
   * wrtie PNG IDAT chunk (with alpha channel).
   */
  Lossless2.prototype.writeIDAT = function() {
    /** @type {number} */
    var tSize;
    /** @type {number} */
    var tLength;
    /** @type {Uint8Array} */
    var tImage;
    /** @type {number} */
    var tOp = 0;
    /** @type {number} */
    var tIp = 0;
    /** @type {number} */
    var tRed;
    /** @type {number} */
    var tGreen;
    /** @type {number} */
    var tBlue;
    /** @type {number} */
    var tAlpha;
    /** @type {number} */
    var tX = 0;
    /** @type {number} */
    var tWidthWithPadding;

    var tPlain = this.plain;
    var tWidth = this.width;
    var tHeight = this.height;
    var tFormat = this.format;

    // calculate buffer size
    switch (this.colourType) {
      case PngColourType.INDEXED_COLOR:
        tLength = tWidth;
        break;
      case PngColourType.TRUECOLOR_WITH_ALPHA:
        tLength = tWidth * 4;
        break;
      default:
        console.warn('invalid png colour type');
    }
    tSize = (tLength + 1) * tHeight;

    // create png idat data
    tImage = new (USE_TYPEDARRAY ? Uint8Array : Array)(tSize);
    var set = this.set;
    // indexed-color png
    if (tFormat === LosslessFormat.COLOR_MAPPED) {
      tWidthWithPadding = (tWidth + 3) & -4;
      while (tOp < tSize) {
        // scanline filter
        tImage[tOp++] = 0;

        // write color-map index
        if (USE_TYPEDARRAY) {
          tImage.set(tPlain.subarray(tIp, tIp + tWidth), tOp);
        } else {
          set(tImage, tPlain.slice(tIp, tIp + tWidth), tOp);
        }
        tOp += tWidth;

        // next
        tIp += tWidthWithPadding;
      }
    // truecolor png
    } else {
      while (tOp < tSize) {
        // scanline filter
        if (tX++ % tWidth === 0) {
          tImage[tOp++] = 0;
        }

        // read RGB
        tAlpha = tPlain[tIp++];
        tRed   = tPlain[tIp++] * 255 / tAlpha | 0;
        tGreen = tPlain[tIp++] * 255 / tAlpha | 0;
        tBlue  = tPlain[tIp++] * 255 / tAlpha | 0;

        // write RGB
        tImage[tOp++] = tRed;
        tImage[tOp++] = tGreen;
        tImage[tOp++] = tBlue;
        tImage[tOp++] = tAlpha;
      }
    }

    this.writeChunk('IDAT', this.fakeZlib(tImage));
  };

  /**
   * wrtie PNG IEND chunk.
   */
  Lossless2.prototype.writeIEND = function() {
    this.writeChunk('IEND', []);
  };

  /**
   * create non-compressed zlib buffer.
   * @param {Uint8Array} pData plain data.
   * @return {Uint8Array}
   */
  Lossless2.prototype.fakeZlib = function(pData) {
    /** @type {number} */
    var tBfinal;
    /** @type {number} */
    var tBtype = 0; // 非圧縮
    /** @type {number} */
    var tLen;
    /** @type {number} */
    var tNlen;
    /** @type {Uint8Array} */
    var tBlock;
    /** @type {number} */
    var tAdler32;
    /** @type {number} */
    var tIp = 0;
    /** @type {number} */
    var tOp = 0;
    /** @type {number} */
    var tSize = (
      /* cmf    */ 1 +
      /* flg    */ 1 +
      /* data   */ pData.length +
      /* header */ (
      (/* bfinal, btype */ 1 +
        /* len           */ 2 +
        /* nlen          */ 2) *
        /* number of blocks */ (1 + (pData.length / mBlockSize | 0))
      ) +
      /* adler  */ 4
    );
    /** @type {Uint8Array} */
    var tOutput = USE_TYPEDARRAY ?
      new Uint8Array(tSize) : new Array(tSize > 0xffff ? 0xffff : tSize);

    // zlib header
    tOutput[tOp++] = 0x78; // CINFO: 7, CMF: 8
    tOutput[tOp++] = 0x01; // FCHECK: 1, FDICT, FLEVEL: 0

    // zlib body
    do {
      tBlock = USE_TYPEDARRAY ?
        pData.subarray(tIp, tIp += mBlockSize) : pData.slice(tIp, tIp += mBlockSize);
      tBfinal = (tBlock.length < mBlockSize || tIp + tBlock.length === pData.length) ? 1 : 0;

      // block header
      tOutput[tOp++] = tBfinal;

      // len
      tLen = tBlock.length;
      tOutput[tOp++] = (tLen      ) & 0xff;
      tOutput[tOp++] = (tLen >>> 8) & 0xff;

      // nlen
      tNlen = 0xffff - tLen;
      tOutput[tOp++] = (tNlen      ) & 0xff;
      tOutput[tOp++] = (tNlen >>> 8) & 0xff;

      // data
      if (USE_TYPEDARRAY) {
       tOutput.set(tBlock, tOp);
      } else {
        this.set(tOutput, tBlock, tOp);
      }
      tOp += tBlock.length;
    } while (!tBfinal);

    // adler-32
    tAdler32 = Zlib.Adler32(pData);
    tOutput[tOp++] = (tAdler32 >> 24) & 0xff;
    tOutput[tOp++] = (tAdler32 >> 16) & 0xff;
    tOutput[tOp++] = (tAdler32 >>  8) & 0xff;
    tOutput[tOp++] = (tAdler32      ) & 0xff;

    return tOutput;
  };

  /**
   * @param {!(Array.<number>|Uint8Array)} array
   * @return {string}
   */
  function byteArray2byteString(array) {
    var size = 0xffff;
    var i, il;
    var tmp = [];

    if (USE_TYPEDARRAY) {
      array.slice = Array.prototype.slice;
    }

    for (i = 0, il = array.length; i < il; i += size) {
      tmp[i] = String.fromCharCode.apply(null, array.slice(i, i + size));
    }

    return tmp.join('');
  }

//-----------------------------------------------------------------------------
// Code copied from zlib.js at https://github.com/imaya/zlib.js
//-----------------------------------------------------------------------------

/**
 * Adler32 ハッシュ値の作成
 * @param {!(Array|Uint8Array|string)} array 算出に使用する byte array.
 * @return {number} Adler32 ハッシュ値.
 */
Zlib.Adler32 = function(array) {
  if (typeof(array) === 'string') {
    array = Zlib.Util.stringToByteArray(array);
  }
  return Zlib.Adler32.update(1, array);
};

/**
 * Adler32 ハッシュ値の更新
 * @param {number} adler 現在のハッシュ値.
 * @param {!(Array|Uint8Array)} array 更新に使用する byte array.
 * @return {number} Adler32 ハッシュ値.
 */
Zlib.Adler32.update = function(adler, array) {
  /** @type {number} */
  var s1 = adler & 0xffff;
  /** @type {number} */
  var s2 = (adler >>> 16) & 0xffff;
  /** @type {number} array length */
  var len = array.length;
  /** @type {number} loop length (don't overflow) */
  var tlen;
  /** @type {number} array index */
  var i = 0;

  while (len > 0) {
    tlen = len > Zlib.Adler32.OptimizationParameter ?
      Zlib.Adler32.OptimizationParameter : len;
    len -= tlen;
    do {
      s1 += array[i++];
      s2 += s1;
    } while (--tlen);

    s1 %= 65521;
    s2 %= 65521;
  }

  return ((s2 << 16) | s1) >>> 0;
};

/**
 * Adler32 最適化パラメータ
 * 現状では 1024 程度が最適.
 * @see http://jsperf.com/adler-32-simple-vs-optimized/3
 * @const
 * @type {number}
 */
Zlib.Adler32.OptimizationParameter = 1024;

Zlib.CRC32 = {};

/**
 * CRC32 ハッシュ値を取得
 * @param {!Uint8Array} data data byte array.
 * @param {number=} pos data position.
 * @param {number=} length data length.
 * @return {number} CRC32.
 */
Zlib.CRC32.calc = function(data, pos, length) {
  return Zlib.CRC32.update(data, 0, pos, length);
};

/**
 * CRC32ハッシュ値を更新
 * @param {!Uint8Array} data data byte array.
 * @param {number} crc CRC32.
 * @param {number=} pos data position.
 * @param {number=} length data length.
 * @return {number} CRC32.
 */
Zlib.CRC32.update = function(data, crc, pos, length) {
  var table = Zlib.CRC32.Table;
  var i = (typeof pos === 'number') ? pos : (pos = 0);
  var il = (typeof length === 'number') ? length : data.length;

  crc ^= 0xffffffff;

  // loop unrolling for performance
  for (i = il & 7; i--; ++pos) {
    crc = (crc >>> 8) ^ table[(crc ^ data[pos]) & 0xff];
  }
  for (i = il >> 3; i--; pos += 8) {
    crc = (crc >>> 8) ^ table[(crc ^ data[pos    ]) & 0xff];
    crc = (crc >>> 8) ^ table[(crc ^ data[pos + 1]) & 0xff];
    crc = (crc >>> 8) ^ table[(crc ^ data[pos + 2]) & 0xff];
    crc = (crc >>> 8) ^ table[(crc ^ data[pos + 3]) & 0xff];
    crc = (crc >>> 8) ^ table[(crc ^ data[pos + 4]) & 0xff];
    crc = (crc >>> 8) ^ table[(crc ^ data[pos + 5]) & 0xff];
    crc = (crc >>> 8) ^ table[(crc ^ data[pos + 6]) & 0xff];
    crc = (crc >>> 8) ^ table[(crc ^ data[pos + 7]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
};

  /**
   * @type {!Uint32Array} CRC-32 Table.
   */
  Zlib.CRC32.Table = (function(table){
    return USE_TYPEDARRAY ? new Uint32Array(table) : table;
  })([
    0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f,
    0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
    0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91, 0x1db71064, 0x6ab020f2,
    0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
    0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
    0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
    0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa, 0x42b2986c,
    0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
    0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423,
    0xcfba9599, 0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
    0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190, 0x01db7106,
    0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
    0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d,
    0x91646c97, 0xe6635c01, 0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e,
    0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
    0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
    0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541, 0x3dd895d7,
    0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
    0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa,
    0xbe0b1010, 0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
    0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
    0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a,
    0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683, 0xe3630b12, 0x94643b84,
    0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
    0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
    0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
    0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8, 0xa1d1937e,
    0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
    0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55,
    0x316e8eef, 0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
    0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28,
    0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
    0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f,
    0x72076785, 0x05005713, 0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38,
    0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
    0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
    0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69,
    0x616bffd3, 0x166ccf45, 0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2,
    0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc,
    0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
    0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693,
    0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
    0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d
  ]);
}(this));
