var ObjectRenderer = require('../../core/renderers/webgl/utils/ObjectRenderer'),
    Shader = require('../../core/renderers/webgl/shaders/Shader'),
    WebGLRenderer = require('../../core/renderers/webgl/WebGLRenderer'),
    glMat = require('gl-matrix'),
    Sprite3dShader = require('./Sprite3dShader'),
    CONST = require('../../core/const');

/**
 * @author Mat Groves
 *
 * Big thanks to the very clever Matt DesLauriers <mattdesl> https://github.com/mattdesl/
 * for creating the original pixi version!
 * Also a thanks to https://github.com/bchevalier for tweaking the tint and alpha so that they now share 4 bytes on the vertex buffer
 *
 * Heavily inspired by LibGDX's Sprite3dRenderer:
 * https://github.com/libgdx/libgdx/blob/master/gdx/src/com/badlogic/gdx/graphics/g2d/Sprite3dRenderer.java
 */

/**
 *
 * @class
 * @private
 * @namespace PIXI
 * @param renderer {WebGLRenderer} The renderer this sprite batch works for.
 */
function Sprite3dRenderer(renderer)
{
    ObjectRenderer.call(this, renderer);

    /**
     *
     *
     * @member {number}
     */
    this.vertSize = 6;

    /**
     *
     *
     * @member {number}
     */
    this.vertByteSize = this.vertSize * 4;

    /**
     * The number of images in the SpriteBatch before it flushes.
     *
     * @member {number}
     */
    this.size = CONST.SPRITE_BATCH_SIZE; // 2000 is a nice balance between mobile / desktop

    // the total number of bytes in our batch
    var numVerts = this.size * 4 * this.vertByteSize;
    // the total number of indices in our batch
    var numIndices = this.size * 7;

    /**
     * Holds the vertices
     *
     * @member {ArrayBuffer}
     */
    this.vertices = new ArrayBuffer(numVerts);

    /**
     * View on the vertices as a Float32Array
     *
     * @member {Float32Array}
     */
    this.positions = new Float32Array(this.vertices);

    /**
     * View on the vertices as a Uint32Array
     *
     * @member {Uint32Array}
     */
    this.colors = new Uint32Array(this.vertices);

    /**
     * Holds the indices
     *
     * @member {Uint16Array}
     */
    this.indices = new Uint16Array(numIndices);

    /**
     *
     *
     * @member {number}
     */
    this.lastIndexCount = 0;

    for (var i=0, j=0; i < numIndices; i += 6, j += 4)
    {
        this.indices[i + 0] = j + 0;
        this.indices[i + 1] = j + 1;
        this.indices[i + 2] = j + 2;
        this.indices[i + 3] = j + 0;
        this.indices[i + 4] = j + 2;
        this.indices[i + 5] = j + 3;
    }

    /**
     *
     *
     * @member {boolean}
     */
    this.drawing = false;

    /**
     *
     *
     * @member {number}
     */
    this.currentBatchSize = 0;

    /**
     *
     *
     * @member {BaseTexture}
     */
    this.currentBaseTexture = null;

    /**
     *
     *
     * @member {Array}
     */
    this.textures = [];

    /**
     *
     *
     * @member {Array}
     */
    this.blendModes = [];

    /**
     *
     *
     * @member {Array}
     */
    this.shaders = [];

    /**
     *
     *
     * @member {Array}
     */
    this.sprites = [];

    /**
     * The default shader that is used if a sprite doesn't have a more specific one.
     *
     * @member {Shader}
     */
    this.shader = null;


    // TODO will need to set up this proper fov. but this works great for now!
    this.perspectiveMatrix = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 1,
        0, 0, 0, 1
    ];

    //this.perspectiveMatrix = makePerspective(45 * (Math.PI / 180), 1, 1, 2000)
    this.projection3d = glMat.mat4.create();
   // console.log(this.perspectiveMatrix)
 //   glMat.mat4.identity(mvMatrix);
  //  glMat.mat4.translate(mvMatrix, [0, 0, -2.0]);
}

// test function...
function makePerspective(fieldOfViewInRadians, aspect, near, far) {
  var f = Math.tan(Math.PI * 0.5 - 0.5 * fieldOfViewInRadians);
  var rangeInv = 1.0 / (near - far);

  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0
  ];
};



Sprite3dRenderer.prototype = Object.create(ObjectRenderer.prototype);
Sprite3dRenderer.prototype.constructor = Sprite3dRenderer;
module.exports = Sprite3dRenderer;

WebGLRenderer.registerPlugin('sprite3d', Sprite3dRenderer);

/**
 * Sets up the renderer context and necessary buffers.
 *
 * @private
 * @param gl {WebGLContext} the current WebGL drawing context
 */
Sprite3dRenderer.prototype.onContextChange = function ()
{
    var gl = this.renderer.gl;

    // setup default shader
    this.shader = new Sprite3dShader(this.renderer.shaderManager);// this.renderer.shaderManager.defaultShader;

    // create a couple of buffers
    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();

    // 65535 is max index, so 65535 / 6 = 10922.

    //upload the index data
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.DYNAMIC_DRAW);

    this.currentBlendMode = 99999;
};

/**
 * Renders the sprite object.
 *
 * @param sprite {Sprite} the sprite to render when using this spritebatch
 */
Sprite3dRenderer.prototype.render = function (sprite)
{
    var texture = sprite._texture;

    //TODO set blend modes..
    // check texture..
    if (this.currentBatchSize >= this.size)
    {
        this.flush();
        this.currentBaseTexture = texture.baseTexture;
    }

    // get the uvs for the texture
    var uvs = texture._uvs;

    // if the uvs have not updated then no point rendering just yet!
    if (!uvs)
    {
        return;
    }

    // TODO trim??
    var aX = sprite.anchor.x;
    var aY = sprite.anchor.y;

    var w0, w1, h0, h1;

    if (texture.trim)
    {
        // if the sprite is trimmed then we need to add the extra space before transforming the sprite coords..
        var trim = texture.trim;

        w1 = trim.x - aX * trim.width;
        w0 = w1 + texture.crop.width;

        h1 = trim.y - aY * trim.height;
        h0 = h1 + texture.crop.height;

    }
    else
    {
        w0 = (texture._frame.width ) * (1-aX);
        w1 = (texture._frame.width ) * -aX;

        h0 = texture._frame.height * (1-aY);
        h1 = texture._frame.height * -aY;
    }

    var index = this.currentBatchSize * this.vertByteSize;

    var worldTransform = sprite.worldTransform;

    var a = worldTransform.a;
    var b = worldTransform.b;
    var c = worldTransform.c;
    var d = worldTransform.d;
    var tx = worldTransform.tx;
    var ty = worldTransform.ty;

    var wt = sprite.worldTransform3d;

    var m0 = wt[0],
        m1 = wt[1],
        m2 = wt[2],
        m4 = wt[4],
        m5 = wt[5],
        m6 = wt[6],
        m12 = wt[12],
        m13 = wt[13],
        m14 = wt[14];

    var colors = this.colors;
    var positions = this.positions;


    if (this.renderer.roundPixels)
    {
        positions[index]   = m0 * w1 + m4 * h1 + m12 | 0;
        positions[index+1] = m1 * w1 + m5 * h1 + m13 | 0;
        positions[index+2] = m2 * w1 + m6 * h1 + m14 | 0;

        // xyz
        positions[index+6] = m0 * w0 + m4 * h1 + m12 | 0;
        positions[index+7] = m1 * w0 + m5 * h1 + m13 | 0;
        positions[index+8] = m2 * w0 + m6 * h1 + m14 | 0;

         // xyz
        positions[index+12] = m0 * w0 + m4 * h0 + m12 | 0;
        positions[index+13] = m1 * w0 + m5 * h0 + m13 | 0;
        positions[index+14] = m2 * w0 + m6 * h0 + m14 | 0;

        // xyz
        positions[index+18] = m0 * w1 + m4 * h0 + m12 | 0;
        positions[index+19] = m1 * w1 + m5 * h0 + m13 | 0;
        positions[index+20] = m2 * w1 + m6 * h0 + m14 | 0;
    }
    else
    {
        var out = [0,0,0];

        // xyz
        positions[index]   = m0 * w1 + m4 * h1 + m12;
        positions[index+1] = m1 * w1 + m5 * h1 + m13;
        positions[index+2] = m2 * w1 + m6 * h1 + m14;

        // xyz
        positions[index+6] = m0 * w0 + m4 * h1 + m12;
        positions[index+7] = m1 * w0 + m5 * h1 + m13;
        positions[index+8] = m2 * w0 + m6 * h1 + m14;

         // xyz
        positions[index+12] = m0 * w0 + m4 * h0 + m12;
        positions[index+13] = m1 * w0 + m5 * h0 + m13;
        positions[index+14] = m2 * w0 + m6 * h0 + m14;

        // xyz
        positions[index+18] = m0 * w1 + m4 * h0 + m12;
        positions[index+19] = m1 * w1 + m5 * h0 + m13;
        positions[index+20] = m2 * w1 + m6 * h0 + m14;
    }

    // uv
    positions[index+3] = uvs.x0;
    positions[index+4] = uvs.y0;

    // uv
    positions[index+9] = uvs.x1;
    positions[index+10] = uvs.y1;

     // uv
    positions[index+15] = uvs.x2;
    positions[index+16] = uvs.y2;

    // uv
    positions[index+21] = uvs.x3;
    positions[index+22] = uvs.y3;

    // color and alpha
    var tint = sprite.tint;
    colors[index+5] = colors[index+11] = colors[index+17] = colors[index+23] = (tint >> 16) + (tint & 0xff00) + ((tint & 0xff) << 16) + (sprite.worldAlpha * 255 << 24);

    // increment the batchsize
    this.sprites[this.currentBatchSize++] = sprite;
};

/**
 * Renders the content and empties the current batch.
 *
 */
Sprite3dRenderer.prototype.flush = function ()
{
    // If the batch is length 0 then return as there is nothing to draw
    if (this.currentBatchSize === 0)
    {
        return;
    }

    var gl = this.renderer.gl;
    var shader;

    // upload the verts to the buffer
    if (this.currentBatchSize > ( this.size * 0.5 ) )
    {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices);
    }
    else
    {
        var view = this.positions.subarray(0, this.currentBatchSize * this.vertByteSize);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, view);
    }

    var nextTexture, nextBlendMode, nextShader;
    var batchSize = 0;
    var start = 0;

    var currentBaseTexture = null;
    var currentBlendMode = this.renderer.blendModeManager.currentBlendMode;
    var currentShader = null;

    var blendSwap = false;
    var shaderSwap = false;
    var sprite;

    for (var i = 0, j = this.currentBatchSize; i < j; i++)
    {

        sprite = this.sprites[i];

        nextTexture = sprite._texture.baseTexture;
        nextBlendMode = sprite.blendMode;
        nextShader = sprite.shader || this.shader;

        blendSwap = currentBlendMode !== nextBlendMode;
        shaderSwap = currentShader !== nextShader; // should I use uuidS???

        if (currentBaseTexture !== nextTexture || blendSwap || shaderSwap)
        {
            this.renderBatch(currentBaseTexture, batchSize, start);

            start = i;
            batchSize = 0;
            currentBaseTexture = nextTexture;

            if (blendSwap)
            {
                currentBlendMode = nextBlendMode;
                this.renderer.blendModeManager.setBlendMode( currentBlendMode );
            }

            if (shaderSwap)
            {
                currentShader = nextShader;

                shader = currentShader.shaders ? currentShader.shaders[gl.id] : currentShader;

                if (!shader)
                {
                    shader = new Shader(this.renderer.shaderManager, null, currentShader.fragmentSrc, currentShader.uniforms);
                    currentShader.shaders[gl.id] = shader;
                }

                // set shader function???
                this.renderer.shaderManager.setShader(shader);

                ///console.log(shader.uniforms.projectionMatrix);

                // both thease only need to be set if they are changing..
                // set the projection
                //gl.uniformMatrix3fv(shader.uniforms.projectionMatrix._location, false, this.renderer.currentRenderTarget.projectionMatrix.toArray(true));

                var projection2d = this.renderer.currentRenderTarget.projectionMatrix;
                var projection3d = this.projection3d;

                projection3d[0] = projection2d.a;
                projection3d[5] = projection2d.d;
                projection3d[10] = 2 / 1700;

                // tx // ty
                projection3d[12] = projection2d.tx;
                projection3d[13] = projection2d.ty;

                // time to make a 3d one!
                var combinedMatrix = glMat.mat4.multiply(glMat.mat4.create(), this.perspectiveMatrix, projection3d)

                gl.uniformMatrix4fv(shader.uniforms.projectionMatrix3d._location, false, combinedMatrix);
            }
        }

        batchSize++;
    }

    this.renderBatch(currentBaseTexture, batchSize, start);

    // then reset the batch!
    this.currentBatchSize = 0;
};

/**
 * Draws the currently batches sprites.
 *
 * @private
 * @param texture {Texture}
 * @param size {number}
 * @param startIndex {number}
 */
Sprite3dRenderer.prototype.renderBatch = function (texture, size, startIndex)
{
    if (size === 0)
    {
        return;
    }

    var gl = this.renderer.gl;

    if (!texture._glTextures[gl.id])
    {
        this.renderer.updateTexture(texture);
    }
    else
    {
        // bind the current texture
        gl.bindTexture(gl.TEXTURE_2D, texture._glTextures[gl.id]);
    }

    // now draw those suckas!
    gl.drawElements(gl.TRIANGLES, size * 6, gl.UNSIGNED_SHORT, startIndex * 6 * 2);

    // increment the draw count
    this.renderer.drawCount++;
};

/**
 * Starts a new sprite batch.
 *
 */
Sprite3dRenderer.prototype.start = function ()
{
    var gl = this.renderer.gl;

    gl.enable(gl.DEPTH_TEST);

    // bind the main texture
    gl.activeTexture(gl.TEXTURE0);

    // bind the buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    // this is the same for each shader?
    var stride =  this.vertByteSize;
    gl.vertexAttribPointer(this.shader.attributes.aVertexPosition, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(this.shader.attributes.aTextureCoord, 2, gl.FLOAT, false, stride, 3 * 4);

    // color attributes will be interpreted as unsigned bytes and normalized
    gl.vertexAttribPointer(this.shader.attributes.aColor, 4, gl.UNSIGNED_BYTE, true, stride, 5 * 4);
};

Sprite3dRenderer.prototype.stop = function ()
{
    var gl = this.renderer.gl;
    this.flush();

    gl.disable(gl.DEPTH_TEST);
}

/**
 * Destroys the SpriteBatch.
 *
 */
Sprite3dRenderer.prototype.destroy = function ()
{
    this.renderer.gl.deleteBuffer(this.vertexBuffer);
    this.renderer.gl.deleteBuffer(this.indexBuffer);

    this.shader.destroy();

    this.renderer = null;

    this.vertices = null;
    this.positions = null;
    this.colors = null;
    this.indices = null;

    this.vertexBuffer = null;
    this.indexBuffer = null;

    this.currentBaseTexture = null;

    this.drawing = false;

    this.textures = null;
    this.blendModes = null;
    this.shaders = null;
    this.sprites = null;
    this.shader = null;
};