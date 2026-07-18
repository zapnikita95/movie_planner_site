/**
 * Circle crop + compress for profile photo (Mini App / Telegram WebView).
 * Exposes: window.mpOpenAvatarCrop(file) -> Promise<Blob|null>
 */
(function (global) {
  "use strict";

  var OUT_SIZE = 512;
  var MAX_OUT_BYTES = 900 * 1024;
  var QUALITIES = [0.88, 0.82, 0.76, 0.7, 0.64, 0.58];

  function lockScroll() {
    if (global.lockViewportScroll) global.lockViewportScroll();
    else {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
  }
  function unlockScroll() {
    if (global.unlockViewportScroll) global.unlockViewportScroll();
    else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        resolve({ img: img, objectUrl: url });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Не удалось открыть фото. Выберите JPG или PNG."));
      };
      img.src = url;
    });
  }

  function blobToCanvas(img, crop) {
    var canvas = document.createElement("canvas");
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);
    // crop: { sx, sy, sSize } in natural image pixels (square)
    ctx.drawImage(
      img,
      crop.sx,
      crop.sy,
      crop.sSize,
      crop.sSize,
      0,
      0,
      OUT_SIZE,
      OUT_SIZE
    );
    return canvas;
  }

  function canvasToJpegBlob(canvas) {
    return new Promise(function (resolve) {
      var i = 0;
      function tryNext() {
        if (i >= QUALITIES.length) {
          canvas.toBlob(function (b) {
            resolve(b);
          }, "image/jpeg", QUALITIES[QUALITIES.length - 1]);
          return;
        }
        var q = QUALITIES[i++];
        canvas.toBlob(function (blob) {
          if (blob && blob.size <= MAX_OUT_BYTES) {
            resolve(blob);
            return;
          }
          tryNext();
        }, "image/jpeg", q);
      }
      tryNext();
    });
  }

  /**
   * @param {File|Blob} file
   * @returns {Promise<Blob|null>} cropped jpeg blob, or null if cancelled
   */
  function openAvatarCrop(file) {
    return loadImageFromFile(file).then(function (loaded) {
      var img = loaded.img;
      var objectUrl = loaded.objectUrl;
      return new Promise(function (resolve, reject) {
        var nw = img.naturalWidth || img.width;
        var nh = img.naturalHeight || img.height;
        if (nw < 16 || nh < 16) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Фото слишком маленькое"));
          return;
        }

        var cropPx = Math.min(300, Math.max(220, Math.floor((global.innerWidth || 360) - 56)));
        var minCover = Math.max(cropPx / nw, cropPx / nh);
        var scale = minCover;
        var minScale = minCover;
        var maxScale = minCover * 4;
        // Image center relative to crop-box center (CSS px)
        var tx = 0;
        var ty = 0;

        var ov = document.createElement("div");
        ov.className = "mp-dialog-overlay avatar-crop-overlay";
        ov.innerHTML =
          '<div class="mp-dialog-card avatar-crop-card">' +
          '<button type="button" class="mp-dialog-close" data-crop-cancel="1" aria-label="Закрыть">×</button>' +
          '<h3 class="mp-dialog-title">Кружок профиля</h3>' +
          '<p class="avatar-crop-hint muted small">Перетащите фото и подберите масштаб</p>' +
          '<div class="avatar-crop-stage" style="width:' +
          cropPx +
          "px;height:" +
          cropPx +
          'px">' +
          '<div class="avatar-crop-viewport">' +
          '<img class="avatar-crop-img" alt="" draggable="false" />' +
          '<div class="avatar-crop-ring" aria-hidden="true"></div>' +
          "</div></div>" +
          '<label class="avatar-crop-zoom-label muted small">Масштаб' +
          '<input type="range" class="avatar-crop-zoom" min="0" max="100" value="0" /></label>' +
          '<div class="avatar-crop-actions">' +
          '<button type="button" class="btn-ghost btn-full" data-crop-cancel="1">Отмена</button>' +
          '<button type="button" class="btn-primary btn-full" data-crop-save="1">Сохранить</button>' +
          "</div></div>";

        lockScroll();
        document.body.appendChild(ov);

        var imgEl = ov.querySelector(".avatar-crop-img");
        var zoomEl = ov.querySelector(".avatar-crop-zoom");
        var saveBtn = ov.querySelector("[data-crop-save]");
        imgEl.src = objectUrl;

        function applyTransform() {
          var dw = nw * scale;
          var dh = nh * scale;
          imgEl.style.width = dw + "px";
          imgEl.style.height = dh + "px";
          imgEl.style.transform =
            "translate(-50%, -50%) translate(" + tx + "px," + ty + "px)";
        }

        function clampPan() {
          var dw = nw * scale;
          var dh = nh * scale;
          var maxX = Math.max(0, (dw - cropPx) / 2);
          var maxY = Math.max(0, (dh - cropPx) / 2);
          tx = Math.max(-maxX, Math.min(maxX, tx));
          ty = Math.max(-maxY, Math.min(maxY, ty));
        }

        function setScaleFromSlider() {
          var t = Number(zoomEl.value) / 100;
          scale = minScale + (maxScale - minScale) * t;
          clampPan();
          applyTransform();
        }

        applyTransform();

        var dragging = false;
        var lastX = 0;
        var lastY = 0;
        var pointers = new Map();
        var pinchStartDist = 0;
        var pinchStartScale = 1;

        function onPointerDown(e) {
          e.preventDefault();
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          imgEl.setPointerCapture(e.pointerId);
          if (pointers.size === 1) {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
          } else if (pointers.size === 2) {
            dragging = false;
            var pts = Array.from(pointers.values());
            var dx = pts[0].x - pts[1].x;
            var dy = pts[0].y - pts[1].y;
            pinchStartDist = Math.hypot(dx, dy) || 1;
            pinchStartScale = scale;
          }
        }
        function onPointerMove(e) {
          if (!pointers.has(e.pointerId)) return;
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.size === 2) {
            var pts = Array.from(pointers.values());
            var dx = pts[0].x - pts[1].x;
            var dy = pts[0].y - pts[1].y;
            var dist = Math.hypot(dx, dy) || 1;
            scale = Math.max(minScale, Math.min(maxScale, pinchStartScale * (dist / pinchStartDist)));
            var t = (scale - minScale) / (maxScale - minScale || 1);
            zoomEl.value = String(Math.round(t * 100));
            clampPan();
            applyTransform();
            return;
          }
          if (!dragging) return;
          var mx = e.clientX - lastX;
          var my = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          tx += mx;
          ty += my;
          clampPan();
          applyTransform();
        }
        function onPointerUp(e) {
          pointers.delete(e.pointerId);
          if (pointers.size < 2) pinchStartDist = 0;
          if (pointers.size === 0) dragging = false;
        }

        imgEl.addEventListener("pointerdown", onPointerDown);
        imgEl.addEventListener("pointermove", onPointerMove);
        imgEl.addEventListener("pointerup", onPointerUp);
        imgEl.addEventListener("pointercancel", onPointerUp);
        zoomEl.addEventListener("input", setScaleFromSlider);

        function cleanup(result) {
          unlockScroll();
          try {
            URL.revokeObjectURL(objectUrl);
          } catch (_e) {}
          try {
            ov.remove();
          } catch (_e2) {}
          resolve(result);
        }

        ov.addEventListener("click", function (e) {
          if (e.target === ov) cleanup(null);
        });
        ov.querySelectorAll("[data-crop-cancel]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            cleanup(null);
          });
        });

        saveBtn.addEventListener("click", function () {
          saveBtn.disabled = true;
          saveBtn.textContent = "Сжимаем…";
          try {
            var sSize = cropPx / scale;
            var cx = nw / 2 - tx / scale;
            var cy = nh / 2 - ty / scale;
            var sx = cx - sSize / 2;
            var sy = cy - sSize / 2;
            sx = Math.max(0, Math.min(nw - sSize, sx));
            sy = Math.max(0, Math.min(nh - sSize, sy));
            var canvas = blobToCanvas(img, { sx: sx, sy: sy, sSize: sSize });
            canvasToJpegBlob(canvas).then(function (blob) {
              if (!blob) {
                saveBtn.disabled = false;
                saveBtn.textContent = "Сохранить";
                return;
              }
              cleanup(blob);
            });
          } catch (_err) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Сохранить";
          }
        });
      });
    });
  }

  global.mpOpenAvatarCrop = openAvatarCrop;
})(typeof window !== "undefined" ? window : globalThis);
