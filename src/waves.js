var WAVES = (function () {
    "use strict";

    var H_EVEN = 0,
        H_ODD = 1,
        V = 2,
        CELL_SIZE = 3,
        FORCE_SCALE = 0.4,
        DECAY_TIME = 200,
        VERTICAL_SCALE = 500;

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function Boat() {
        var bow = new R3.V(0.0, 1.0, 0.1),
            base = new R3.V(0.0, -1.0, -0.20),
            left = new R3.V(-0.5, -1.0, 0.10),
            right = new R3.V( 0.5, -1.0, 0.10),
            keel = R3.subVectors(bow, base),
            points = [
                bow, left, right,
                bow, left, base,
                bow, base, right,
                base, right, left
            ],
            faceNormals = [
                new R3.V(0, 0, 1),
                keel.cross(R3.subVectors(left, base)),
                keel.cross(R3.subVectors(left, keel)),
                new R3.V(0, -1, 0),
            ],
            mesh = new WGL.Mesh();

        for (var p = 0; p < points.length; ++p) {
            var point = points[p];
            point.pushOn(mesh.vertices);
            mesh.bbox.envelope(point);
        }
        for (var n = 0; n < faceNormals.length; ++n) {
            var normal = faceNormals[n];
            normal.pushOn(mesh.normals);
            normal.pushOn(mesh.normals);
            normal.pushOn(mesh.normals);
        }
        mesh.uvs = [
            0.5, 1.0,
            0.0, 0.0,
            1.0, 0.0,
            0.5, 1.0,
            0.0, 0.0,
            1.0, 0.0,
            0.5, 1.0,
            0.0, 0.0,
            1.0, 0.0,
            0.5, 1.0,
            0.0, 0.0,
            1.0, 0.0
        ];
        mesh.tris = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        mesh.finalize();
        this.scale = 0.05;
        this.mesh = mesh;
        this.position = new R3.V(0, -0.8, 0);
        this.angle = 0;
        var physicsScale = 0.5;
        this.bow = bow.scaled(physicsScale);
        this.left = left.scaled(physicsScale);
        this.right = right.scaled(physicsScale);
        this.velocity = 0;
        this.maxVelocity = 0.02;
        this.accelTime = 20;
    }

    Boat.prototype.update = function(elapsed, view, engines, steer) {
        var m = this.mesh.transform,
            up = new R3.V(0, 0, 1),
            bow = m.transformP(this.bow),
            left = m.transformP(this.left),
            right = m.transformP(this.right),
            forward = m.transform(new R3.V(0, 1, 0)),
            steerAngle = steer * 0.02 * (0.5 + this.velocity / this.maxVelocity),
            spin = false;
        bow.z = view.getHeight(bow.x, bow.y);
        left.z = view.getHeight(left.x, left.y);
        right.z = view.getHeight(right.x, right.y);

        this.position.z = (bow.z + left.z + right.z) / 3;

        var rightDir = R3.subVectors(right, bow),
            leftDir = R3.subVectors(left, bow);
        rightDir.normalize();
        leftDir.normalize();

        var normal = leftDir.cross(rightDir);
        normal.normalize();
        var angle = Math.acos(normal.dot(up)),
            pull = R3.vectorOntoPlane(new R3.V(0, 0, -1), normal);
        pull.z = 0;
        this.position.addScaled(pull, 0.015);

        var velocityStep = this.maxVelocity / (this.accelTime / elapsed);
        if (engines) {
            this.velocity = Math.min(this.maxVelocity, this.velocity + velocityStep);
        } else {
            this.velocity = Math.max(0, this.velocity - velocityStep / 2);
        }
        if (this.velocity > 0) {
            forward.z = 0;
            forward.normalize();
            this.position.addScaled(forward, this.velocity);
        }
        var cellSizeX = 2.0 / view.cellsX,
            cellSizeY = 2.0 / view.cellsY,
            clampedX = clamp(this.position.x, - 1 + cellSizeX, 1 - cellSizeX),
            clampedY = clamp(this.position.y, - 1 + cellSizeY, 1 - cellSizeY);

        if (this.position.x != clampedX) {
            this.position.x = clampedX;
            this.velocity = 0;
        }

        if (this.position.y != clampedY) {
            this.position.y = clampedY;
            this.velocity = 0;
        }

        m.setIdentity();
        m.translate(this.position);
        m.scale(this.scale);
        if (angle > (Math.PI * 0.01)) {
            var rotation = R3.makeRotateQ(R3.angleAxisQ(angle, normal.cross(up)));
            R3.matmul(m, rotation, m);
            spin = true;
        }

        if (spin) {
            var toSide = R3.subVectors(right, left),
                pullStrength = pull.length();
            toSide.z = 0;
            toSide.normalize();
            pull.scale(1 / pullStrength);
            pullStrength *= 0.5;
            var dot = toSide.dot(pull);
            if (dot < 0) {
                toSide.scale(-1);
            }
            var pullAngle = Math.acos(toSide.dot(pull)),
                torque = toSide.cross(pull);
            if (torque.z < 0) {
                pullAngle = -pullAngle;
            }
            steerAngle += pullAngle * (pullStrength * pullStrength);
        }
        this.angle = R2.clampAngle(this.angle + steerAngle);
        var twist = R3.makeRotateZ(this.angle);
        R3.matmul(m, twist, m);
        this.mesh.transform = m;
    };

    function RegionPoint(x, y) {
        this.x = x;
        this.y = y;
    }

    RegionPoint.prototype.includes = function(x, y) {
        return this.x == x && this.y == y;
    };

    RegionLineX.prototype.includes = function(x, y) {
        return this.x == x && this.y == y;
    };

    function RegionLineX(x, yMin, yMax) {
        this.x = x;
        this.yMin = yMin;
        this.yMax = yMax;
    }

    RegionLineX.prototype.includes = function(x, y) {
        return this.x == x && this.yMin <= y && y <= this.yMax;
    };

    function RegionLineY(y, xMin, xMax) {
        this.y = y;
        this.xMin = xMin;
        this.xMax = xMax;
    }

    RegionLineY.prototype.includes = function(x, y) {
        return this.y == y && this.xMin <= x && x <= this.xMax;
    };

    function Thumper(region, flip, frequency, amplitude) {
        this.frequency = frequency || Math.PI / 20;
        this.amplitude = amplitude || 0.0002;

        this.time = 0;
        this.active = false;

        this.flip = flip || false;
        this.region = region;
        this.lastValue = 0;
        this.delta = 0;
    }

    Thumper.prototype.scaleFrequency = function (factor) {
        this.frequency *= factor;
        this.time /= factor;
    };

    Thumper.prototype.scaleAmplitude = function (factor) {
        this.amplitude *= factor;
    };

    Thumper.prototype.includes = function (x, y) {
        return this.active && this.region.includes(x, y);
    };

    Thumper.prototype.update = function (elapsed) {
        this.time += elapsed;
        if (this.active) {
            var value = Math.sin(this.time * this.frequency) * this.amplitude,
                result = value - this.lastValue;
            this.lastValue = value;
            this.delta = this.flip ? -result : result;
        }
    };

    Thumper.prototype.start = function (reset) {
        if (reset) {
            this.stop();
        }
        this.active = true;
    };

    Thumper.prototype.stop = function () {
        this.active = false;
        this.time = 0;
        this.lastValue = 0;
        this.delta = 0;
    };

    function Damper(region, attenuation) {
        this.region = region;
        this.attenuation = attenuation;
    }

    Damper.prototype.includes = function (x, y) {
        return this.region.includes(x, y);
    };

    function View() {
        this.batch = new BLIT.Batch("images/");
        this.surfaceTexture = this.batch.load("wavy.png");
        this.batch.commit();

        this.clearColor = [0, 0, 0, 1];
        this.maximize = true;
        this.updateInDraw = false;
        this.updateInterval = 15;
        this.consumeKeys = true;
        this.canvasInputOnly = true;
        this.meshes = null;
        this.program = null;
        this.yAxisAngle = 0;
        this.xAxisAngle = -Math.PI/5;
        this.room = null;
        this.distance = 1.5;
        this.center = new R3.V(0, 0, 0);
        this.eyeHeight = -0.3;

        this.cellsX = 254;
        this.cellsY = 256;
        this.cellCount = this.cellsX * this.cellsY;

        this.cells = new Float32Array(this.cellCount * CELL_SIZE);
        this.hA = H_EVEN;
        this.hB = H_ODD;
        this.surface = null;

        this.time = 0;

        this.dampenBoundary = false;

        this.clickThumper = new Thumper(new RegionPoint(this.cellsX / 2, this.cellsY / 2), true);
        this.ocean = new Thumper(new RegionLineY(0, 0, this.cellsX), false, Math.PI/100, 0.0001);

        this.thumpers = [this.clickThumper, this.ocean];

        this.boat = new Boat();

        this.surface = this.constructSurface();
        this.meshes = [this.surface, this.boat.mesh];

        this.audioPlayback = null;
    }

    View.prototype.toCellX = function (worldX) {
        return clamp(Math.round((worldX + 1) * 0.5 * this.cellsX), 0, this.cellsX - 1);
    };

    View.prototype.toCellY = function (worldY) {
        return clamp(Math.round((worldY + 1) * 0.5 * this.cellsY), 0, this.cellsY - 1);
    };

    View.prototype.toWorldX = function (cellX) {
        var half = this.cellsX * 0.5;
        return (cellX - half) / half;
    };

    View.prototype.toWorldY = function (cellY) {
        var half = this.cellsY * 0.5;
        return (cellY - half) / half;
    };

    View.prototype.getHeight = function (worldX, worldY) {
        var cellX = this.toCellX(worldX),
            cellY = this.toCellY(worldY);

        return this.cells[((cellY * this.cellsX) + cellX) * CELL_SIZE + this.hA] * VERTICAL_SCALE;
    };

    function updateMeshVertex(mesh, index, z, b) {
        mesh.vertices[index * 3 + 2] = z;
        mesh.colors[index * 4 + 0] = 1 - b;
        mesh.colors[index * 4 + 2] = b;
        mesh.updated = true;
    }

    View.prototype.cellIndex = function(cellX, cellY) {
        return ((cellY * this.cellsX) + cellX) * CELL_SIZE;
    };

    View.prototype.propagate = function (elapsed) {
        var index = 0,
            hIn = this.hA,
            hOut = this.hB,
            lastX = this.cellsX - 1,
            lastY = this.cellsY - 1,
            decay = Math.max(0, (DECAY_TIME - elapsed) / DECAY_TIME);

        if (this.boat.velocity > (this.boat.maxVelocity * 0.1)) {
            var boatX = this.toCellX(this.boat.position.x),
                boatY = this.toCellY(this.boat.position.y);
            this.cells[this.cellIndex(boatX, boatY) + hIn] -= this.boat.velocity * 0.0005;
        }

        for (var y = 0; y < this.cellsY; ++y) {
            var yLow = y > 0 ? -1 : 0,
                yHi = y < lastY ? 1 : 0;
            for(var x = 0; x < this.cellsX; ++x) {
                var force = false,
                    i = index * CELL_SIZE,
                    prevH = this.cells[i + hIn],
                    prevV = this.cells[i + V],
                    newH = prevH,
                    newV = prevV;

                for (var t = 0; t < this.thumpers.length; ++t) {
                    var thumper = this.thumpers[t];
                    if (thumper.includes(x, y)) {
                        force = true;
                        newH = prevH + thumper.delta;
                        newV = thumper.delta / elapsed;
                        break;
                    }
                }

                if (!force) {
                    var hSum = -prevH,
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
                        deltaV = hDiff * FORCE_SCALE * elapsed;
                    newV = prevV * decay + deltaV;
                    newH = prevH + newV * elapsed;

                }
                newH = clamp(newH, -1, 1);

                this.cells[i + hOut] = newH;
                this.cells[i + V] = newV;

                if (this.surface) {
                    updateMeshVertex(this.surface, index, newH * VERTICAL_SCALE, (100000 * newV + 1) / 2);
                }
                ++index;
            }
        }

        this.hA = hOut;
        this.hB = hIn;
    };

    View.prototype.soundWaves = function (audioProcessingEvent) {
        var outputBuffer = audioProcessingEvent.outputBuffer;
        for (var channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
            var buffer = outputBuffer.getChannelData(channel),
                offset = this.hA,
                prev = 0,
                s = 0,
                stride = this.cellsX,
                cells = this.cellsY,
                repeats = audioProcessingEvent.inputBuffer.getChannelData(channel).length / this.cellsY;
            for (var c = 0; c < cells; ++c) {
                var value = this.cells[((c * stride) * CELL_SIZE) + this.hA] * 500;
                for (var r = 0; r < repeats; ++r) {
                    buffer[s] = value;
                    ++s;
                }
            }
        }
    };

    View.prototype.setRoom = function (room) {
        this.room = room;
    };

    View.prototype.update = function (now, elapsed, keyboard, pointer) {
        var fixedTime = 2;
        this.time += fixedTime;

        if (keyboard.wasAsciiPressed("K")) {
            this.clickThumper.scaleFrequency(2);
        } else if(keyboard.wasAsciiPressed("J")) {
            this.clickThumper.scaleFrequency(0.5);
        }

        if (keyboard.wasAsciiPressed("M")) {
            this.clickThumper.scaleAmplitude(2);
        } else if(keyboard.wasAsciiPressed("N")) {
            this.clickThumper.scaleAmplitude(0.5);
        }

        if (keyboard.wasAsciiPressed("O")) {
            if (!this.ocean.active) {
                this.ocean.start(true);
            } else {
                this.ocean.stop();
            }
        }

        if (keyboard.wasAsciiPressed("T")) {
            if (this.audioPlayback == null) {
                var self = this;
                this.audioPlayback = BLORT.playDynamic(
                    function (audioProcessingEvent) {
                        self.soundWaves(audioProcessingEvent);
                    }, 4096
                );
            } else {
                this.audioPlayback();
                this.audioPlayback = null;
            }
        }

        var forward = false,
            steer = 0;

        if (keyboard.isKeyDown(IO.KEYS.Up) || keyboard.isAsciiDown("W")) {
            forward = true;
        }
        if (keyboard.isKeyDown(IO.KEYS.Left) || keyboard.isAltDown("A")) {
            steer = 1;
        }
        if (keyboard.isKeyDown(IO.KEYS.Right) || keyboard.isAltDown("D")) {
            steer = -1;
        }

        if (pointer.wheelY) {
            var WHEEL_BASE = 1000;
            this.distance *= (WHEEL_BASE + pointer.wheelY) / WHEEL_BASE;
        }

        if (pointer.primary) {
            var orientation = this.viewOrientation(),
                viewStab = this.room.stabDirection(pointer.primary.x, pointer.primary.y, "safe"),
                stabDir = R3.makeRotateQ(orientation.inverse()).transform(viewStab),
                stab = R3.makeRotateQ(orientation).transformP(this.viewPosition());
            stab.addScaled(stabDir, -stab.z / stabDir.z);

            var xCell = Math.round((stab.x + 1) * 0.5 * this.cellsX),
                yCell = Math.round((stab.y + 1) * 0.5 * this.cellsY);
            if (Math.abs(stab.x) < 1 && Math.abs(stab.y) < 1) {
                this.clickThumper.region = new RegionPoint(xCell, yCell);
                this.clickThumper.start();
            } else {
                this.clickThumper.stop();
            }
        } else {
            this.clickThumper.stop();
        }

        if (keyboard.isShiftDown()) {
        } else if(keyboard.isAltDown()) {
        }

        for (var t = 0; t < this.thumpers.length; ++t) {
            this.thumpers[t].update(fixedTime);
        }

        this.propagate(fixedTime);

        this.boat.update(fixedTime, this, forward, steer);
    };

    View.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        if (this.program === null) {
            var shader = room.programFromElements("vertex-test", "fragment-test");
            this.program = {
                shader: shader,
                mvUniform: "uMVMatrix",
                perspectiveUniform: "uPMatrix",
                normalUniform: "uNormalMatrix",
                vertexPosition: room.bindVertexAttribute(shader, "aPos"),
                vertexNormal: room.bindVertexAttribute(shader, "aNormal"),
                vertexUV: room.bindVertexAttribute(shader, "aUV"),
                vertexColor: room.bindVertexAttribute(shader, "aColor"),
                textureVariable: "uSampler"
            };
            room.viewer.position.set(0, 0, 2);
            room.gl.enable(room.gl.CULL_FACE);
        }
        if (!this.batch.loaded) {
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
                room.setupView(this.program, eyes[e], viewMatrix, vrFrame);
                this.drawMeshes(room);
            }
            room.viewer.submitVR();
        }
        room.viewer.orientation = this.viewOrientation();
        room.viewer.position = this.viewPosition();
        if (room.viewer.showOnPrimary()) {
            room.setupView(this.program, "safe");
            this.drawMeshes(room);
        }
    };

    View.prototype.viewOrientation = function () {
        return R3.eulerToQ(this.xAxisAngle, this.yAxisAngle, 0);
    };

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

    View.prototype.calculateVertex = function (mesh, x, y) {
        var vertex = new R3.V(this.toWorldX(x), this.toWorldY(y), 0),
            u = x / (this.cellsX - 1),
            v = y / (this.cellsY - 1),
            normal = new R3.V(0, 0, 1);
        mesh.addVertex(vertex, normal, u, v, 1, 0, 0, 1);
    }

    function addTris(mesh, index, stride) {
        mesh.addTri(index,    index + stride, index + 1);
        mesh.addTri(index + 1,index + stride, index + stride + 1);
    }

    View.prototype.constructSurface = function () {
        var mesh = new WGL.Mesh();
        mesh.image = this.surfaceTexture;

        for (var y = 0; y < this.cellsY; ++y) {
            var generateTris = y < (this.cellsY - 1);
            for (var x = 0; x < this.cellsX; ++x) {
                var generateTri = generateTris && x < (this.cellsX - 1);
                if (generateTri) {
                    addTris(mesh, mesh.index, this.cellsX);
                }
                this.calculateVertex(mesh, x, y);
            }
        }
        return mesh;
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
