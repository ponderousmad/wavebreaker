var WAVES = (function () {
    "use strict";

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
        this.vrToggleIDs = { enter: "enterVR", exit: "exitVR" };
        this.room = null;
        this.center = R3.origin();
        this.eyeHeight = 0.25;

        var self = this;
    }

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
    };

    View.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        if (this.program === null) {
            var shader = room.programFromElements("vertex-test", "fragment-test");
            this.program = {
                shader: shader,
                vertexPosition: room.bindVertexAttribute(shader, "aPos"),
                vertexUV: room.bindVertexAttribute(shader, "aUV"),
                textureVariable: "uSampler"
            };
            room.viewer.far = 20;
            room.gl.enable(room.gl.CULL_FACE);
        }
        if (room.viewer.inVR()) {
            var vrFrame = room.viewer.vrFrame(),
                pivot = new R3.V(0, 0, this.eyeHeight),
                m = this.levelMatrix(pivot);
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

    function calculateVertex(mesh, parameters, x, y, depth) {
        var pixel = new R3.V(
            depth * (parameters.xOffset + x) / parameters.xFactor,
            depth * (parameters.yOffset - y) / parameters.yFactor,
            -depth
        );
        var normal = pixel.normalized();
        mesh.addVertex(pixel, normal, x * parameters.uScale, y * parameters.vScale);
    }

    function addTris(mesh, index, stride) {
        mesh.addTri(index,    index + stride, index + 1);
        mesh.addTri(index + 1,index + stride, index + stride + 1);
    }

    View.prototype.constructGrid = function () {
        var height = scene.height,
            width = scene.width,
            xStride = 1,
            yStride = 1
            meshes = [];

        for (var y = 0; y <= height; y += yStride) {
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
