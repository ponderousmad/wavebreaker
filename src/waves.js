var WAVES = (function () {
    "use strict";

    var H = 0,
        V = 1,
        CELL_SIZE = V,
        FORCE_SCALE = 1,
        DECAY_TIME = 5000;

    function View() {
        this.clearColor = [0, 0, 0, 1];
        this.maximize = true;
        this.updateInDraw = true;
        this.updateInterval = null;
        this.consumeKeys = true;
        this.canvasInputOnly = true;
        this.meshes = null;
        this.program = null;
        this.yAxisAngle = 0;
        this.xAxisAngle = 0;
        this.room = null;
        this.distance = 1;
        this.center = R3.origin();
        this.eyeHeight = 0.25;

        var self = this;

        this.cellsX = 200;
        this.cellsY = 200;
        this.cellCount = this.cellsX * this.cellsY;

        this.cells = new Float32Array(this.cellCount * CELL_SIZE);
    }

    View.prototype.propagate = function (elapsed) {
        var i = 0,
            lastX = this.cellsX - 1,
            lastY = this.cellsY - 1,
            decay = (DECAY_TIME - elapsed) / DECAY_TIME;

        for (var y = 0; y < this.cellsY; ++y) {
            var yLow = y > 0 ? -1 : 0,
                yHi = y < lastY ? 1 : 0;
            for(var x = 0; x < this.cellsX; ++x) {
                var hSum = -this.cells[i + H],
                    count = 0,
                    xHi = x < lastX ? 1 : 0,
                    xLow = x > 0 ? -1 : 0;

                for (var dy = yLow; dy <= yHi; ++dy) {
                    var yOffset = dy * this.cellsX;
                    for (var dx = xLow; dx <= xHi; ++dx) {
                        ++count;
                        hSum += this.cells[i + ((dx + yOffset) * CELL_SIZE) + H];
                    }
                }

                var hDiff = (hSum / count) - this.cells[i + H],
                    prevV = this.cells[i + V],
                    newV = prevV * decay + hDiff * FORCE_SCALE * elapsed;
                this.cells[i + V] = newV;
                this.cells[i + H] += newV * elapsed;
                i += CELL_SIZE;
            }
        }
    };

    View.prototype.setRoom = function (room) {
        this.room = room;
    };

    View.prototype.update = function (now, elapsed, keyboard, pointer) {
        if (keyboard.wasAsciiPressed("F")) {
        }

        if (pointer.wheelY) {
        }

        if (pointer.activated()) {
        }

        if (pointer.primary) {
        }

        if (keyboard.isShiftDown()) {
        } else if(keyboard.isAltDown()) {
        }
        this.propagate(this.even);
    };

    View.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        if (this.program === null) {
            var shader = room.programFromElements("vertex-test", "fragment-test");
            this.program = {
                shader: shader,
                vertexPosition: room.bindVertexAttribute(shader, "aPos"),
                vertexColor: room.bindVertexAttribute(shader, "aColor"),
            };
            room.viewer.far = 20;
            room.gl.enable(room.gl.CULL_FACE);
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
        if (room.viewer.showOnPrimary()) {
            room.viewer.orientation = R3.eulerToQ(this.xAxisAngle, this.yAxisAngle, 0);
            var offset = R3.makeRotateQ(room.viewer.orientation).transformP(this.center);
            room.viewer.position = R3.addVectors(offset, new R3.V(0, 0, -this.distance));
            room.setupView(this.program.shader, "safe", "uMVMatrix", "uPMatrix");
            this.drawMeshes(room);
        }
    };

    View.prototype.drawMeshes = function (room) {
        if (this.meshes !== null) {
            for (var m = 0; m < this.meshes.length - (this.showCompass ? 0 : 1); ++m) {
                room.drawMesh(this.meshes[m], this.program);
            }
        }
    };

    function addTris(mesh, index, stride) {
        mesh.addTri(index,    index + stride, index + 1);
        mesh.addTri(index + 1,index + stride, index + stride + 1);
    }

    View.prototype.constructGrid = function () {
        var height = this.cellsY,
            width = scene.width,
            xStride = 1,
            yStride = 1,
            meshes = [];

        for (var y = 0; y < this.cellsY; y += yStride) {
            var oldMesh = null,
                generateTris = y < height;
            if (generateTris && (y % rowsPerChunk) === 0) {
                oldMesh = mesh;
                mesh = new WGL.Mesh();
                meshes.push(mesh);
            }
            for (var x = 0; x <= width; x += xStride) {
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
