var WAVES = (function () {
    "use strict";

    var H_EVEN = 0,
        H_ODD = 1,
        V = 2,
        CELL_SIZE = 3,
        FORCE_SCALE = 0.4,
        DECAY_TIME = 200;

    function View() {
        this.clearColor = [0, 0, 0, 1];
        this.maximize = true;
        this.updateInDraw = false;
        this.updateInterval = 15;
        this.consumeKeys = true;
        this.canvasInputOnly = true;
        this.meshes = null;
        this.program = null;
        this.yAxisAngle = 0;
        this.xAxisAngle = -Math.PI/3.5;
        this.room = null;
        this.distance = 1.8;
        this.center = new R3.V(0, 0, 0);
        this.eyeHeight = -0.3;

        var self = this;

        this.cellsX = 250;
        this.cellsY = 250;
        this.cellCount = this.cellsX * this.cellsY;

        this.cells = new Float32Array(this.cellCount * CELL_SIZE);
        this.hA = H_EVEN;
        this.hB = H_ODD;

        this.time = 0;

        this.forceX = this.cellsX / 2;
        this.forceY = this.cellsY / 2;

        this.dampenBoundary = false;
    }

    function updateMeshVertex(mesh, index, z, b) {
        mesh.vertices[index * 3 + 2] = z;
        mesh.colors[index * 4 + 0] = 1 - b;
        mesh.colors[index * 4 + 2] = b;
        mesh.updated = true;
    };

    View.prototype.propagate = function (elapsed, force) {
        var index = 0,
            hIn = this.hA,
            hOut = this.hB,
            lastX = this.cellsX - 1,
            lastY = this.cellsY - 1,
            decay = Math.max(0, (DECAY_TIME - elapsed) / DECAY_TIME);
        for (var y = 0; y < this.cellsY; ++y) {
            var yLow = y > 0 ? -1 : 0,
                yHi = y < lastY ? 1 : 0;
            for(var x = 0; x < this.cellsX; ++x) {
                var i = index * CELL_SIZE,
                    prevH = this.cells[i + hIn],
                    hSum = -prevH,
                    count = -1,
                    xHi = x < lastX ? 1 : 0,
                    xLow = x > 0 ? -1 : 0;

                for (var dy = yLow; dy <= yHi; ++dy) {
                    var yOffset = dy * this.cellsX;
                    for (var dx = xLow; dx <= xHi; ++dx) {
                        ++count;
                        var offset = ((dx + yOffset) * CELL_SIZE);
                        hSum += this.cells[i + offset + hIn];
                    }
                }
                if (this.dampenBoundary) {
                    count = 8;
                }

                var hDiff = (hSum / count) - prevH,
                    prevV = this.cells[i + V],
                    deltaV = hDiff * FORCE_SCALE * elapsed,
                    newV = prevV * decay + deltaV,
                    newH = this.cells[i + hIn] + newV * elapsed;
                newH = Math.max(-1, Math.min(1, newH));

                if (force && x == this.forceX && y == this.forceY) {
                    newV = 0;
                    newH = Math.sin(this.time/20 * Math.PI) * 0.0005;
                }

                this.cells[i + hOut] = newH;
                this.cells[i + V] = newV;

                if (this.meshes) {
                    updateMeshVertex(this.meshes[0], index, 500 * newH, (100000 * newV + 1) / 2);
                }
                ++index;
            }
        }
        this.hA = hOut;
        this.hB = hIn;
    };

    View.prototype.setRoom = function (room) {
        this.room = room;
        this.meshes = this.constructGrid();
        this.propagate(0);
    };

    View.prototype.update = function (now, elapsed, keyboard, pointer) {
        var fixedTime = 2,
            force = false;
        this.time += fixedTime;
        if (keyboard.isAsciiDown("S")) {
            force = true;
        }

        if (pointer.wheelY) {
        }

        if (pointer.primary) {
            var orientation = this.viewOrientation(),
                viewStab = this.room.stabDirection(pointer.primary.x, pointer.primary.y, "safe"),
                stabDir = R3.makeRotateQ(orientation.inverse()).transform(viewStab),
                stab = R3.makeRotateQ(orientation).transformP(this.viewPosition());
            stab.addScaled(stabDir, -stab.z / stabDir.z);

            if (Math.abs(stab.x) < 1 && Math.abs(stab.y) < 1) {
                force = true;
                this.forceX = Math.round((stab.x + 1) * 0.5 * this.cellsX);
                this.forceY = Math.round((stab.y + 1) * 0.5 * this.cellsY);
            }
        }

        if (keyboard.isShiftDown()) {
        } else if(keyboard.isAltDown()) {
        }

        this.propagate(2, force);
    };

    View.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        if (this.program === null) {
            var shader = room.programFromElements("vertex-test", "fragment-test");
            this.program = {
                shader: shader,
                vertexPosition: room.bindVertexAttribute(shader, "aPos"),
                vertexUV: room.bindVertexAttribute(shader, "aUV"),
                vertexColor: room.bindVertexAttribute(shader, "aColor"),
                textureVariable: "uSampler"
            };
            room.viewer.position.set(0, 0, 2);
            room.gl.enable(room.gl.CULL_FACE);
            this.program.batch = new BLIT.Batch("images/");
            this.meshTexture = this.program.batch.load("wavy.png");
            this.program.batch.commit();
        }
        if (!this.program.batch.loaded) {
            return;
        }
        if (room.viewer.inVR()) {
            var vrFrame = room.viewer.vrFrame(),
                pivot = new R3.V(0, 0, this.eyeHeight),
                m = r3.identity();
            room.viewer.orientation.set(0, 0, 0, 1);
            room.viewer.position.set(0, 0, 0);

            m.translate(R3.toOrigin(pivot));
            m = R3.matmul(R3.makeRotateQ(R3.eulerToQ(this.xAxisAngle, this.yAxisAngle, 0)), m);
            m.translate(new R3.V(0, 0, this.distance - this.center.z));

            var eyes = ["left", "right"],
                views = [vrFrame.leftViewMatrix, vrFrame.rightViewMatrix];
            for (var e = 0; e < eyes.length; ++e) {
                var viewMatrix = R3.matmul(new R3.M(views[e]), m);
                room.setupView(this.program.shader, eyes[e], "uMVMatrix", "uPMatrix", viewMatrix, vrFrame);
                this.drawMeshes(room);
            }
            room.viewer.submitVR();
        }
        room.viewer.orientation = this.viewOrientation();
        room.viewer.position = this.viewPosition();
        if (room.viewer.showOnPrimary()) {
            room.setupView(this.program.shader, "safe", "uMVMatrix", "uPMatrix");
            this.drawMeshes(room);
        }
    };

    View.prototype.viewOrientation = function () {
        return R3.eulerToQ(this.xAxisAngle, this.yAxisAngle, 0);
    }

    View.prototype.viewPosition = function () {
        return new R3.V(0, this.eyeHeight, this.distance);
    };

    View.prototype.drawMeshes = function (room) {
        if (this.meshes !== null) {
            for (var m = 0; m < this.meshes.length; ++m) {
                room.drawMesh(this.meshes[m], this.program);
            }
        }
    };

    function calculateVertex(mesh, x, y, halfWidth, halfHeight) {
        var v = new R3.V(
            (x - halfWidth) / halfWidth,
            (y - halfHeight) / halfHeight,
            0
        );
        var normal = new R3.V(0, 0, 1);
        mesh.addVertex(v, normal, x / (2*halfWidth), y / (2*halfHeight), 1, 0, 0, 1);
    }

    function addTris(mesh, index, stride) {
        mesh.addTri(index,    index + stride, index + 1);
        mesh.addTri(index + 1,index + stride, index + stride + 1);
    }

    View.prototype.constructGrid = function () {
        var xStride = 1,
            yStride = 1,
            lastX = this.cellsX - 1,
            lastY = this.cellsY - 1,
            halfWidth = lastX * 0.5,
            halfHeight = lastY * 0.5,
            rowsPerChunk = this.cellsY,
            mesh = null,
            meshes = [];

        for (var y = 0; y < this.cellsY; y += yStride) {
            var oldMesh = null,
                generateTris = y < lastY;
            if (generateTris && (y % rowsPerChunk) === 0) {
                oldMesh = mesh;
                mesh = new WGL.Mesh();
                mesh.image = this.meshTexture;
                meshes.push(mesh);
            }
            for (var x = 0; x < this.cellsX; x += xStride) {
                var generateTri = generateTris && x < lastX;
                if (generateTri) {
                    addTris(mesh, mesh.index, this.cellsX);
                }
                calculateVertex(mesh, x, y, halfWidth, halfHeight);
            }
       }

        return meshes;
    };

    window.onload = function(e) {
        var canvas = document.getElementById("canvas3D"),
            view = new View();

        canvas.tabIndex = 1000; // Hack to get canvas to accept keyboard input.
        view.inputElement = canvas;

        var room = MAIN.start(canvas, view);
        view.setRoom(room);
        MAIN.runTestSuites();
    };

    return {
    };
}());
