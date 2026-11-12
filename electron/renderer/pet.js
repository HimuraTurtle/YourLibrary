(function () {
  var img = document.getElementById("portrait");
  var downX = 0;
  var downY = 0;
  var moved = false;
  var dragging = false;
  var lastX = 0;
  var angle = 0;

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function render(emotion) {
    window.library.resolvePortrait(emotion).then(function (url) {
      if (url) img.src = url;
    });
  }

  window.library.getState().then(function (state) {
    render(state.currentEmotion);
  });

  window.library.onEmotionChange(function (emotion) {
    render(emotion);
  });

  img.addEventListener("pointerdown", function (e) {
    img.setPointerCapture(e.pointerId);
    downX = e.screenX;
    downY = e.screenY;
    moved = false;
    dragging = true;
    lastX = e.screenX;
    angle = 0;
    window.library.dragStart(e.screenX, e.screenY);
  });

  img.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    if (typeof e.screenX !== "number" || typeof e.screenY !== "number") return;
    if (!moved && Math.abs(e.screenX - downX) + Math.abs(e.screenY - downY) > 4) {
      moved = true;
      window.library.setSituation("dragging");
    }
    if (moved) {
      var dx = e.screenX - lastX;
      angle = clamp(angle * 0.7 - dx * 1.2, -18, 18);
      img.style.transform = "rotate(" + angle + "deg)";
      window.library.dragMove(e.screenX, e.screenY);
    }
    lastX = e.screenX;
  });

  img.addEventListener("pointerup", function () {
    if (!dragging) return;
    dragging = false;
    angle = 0;
    img.style.transform = "";
    window.library.dragEnd();
    if (!moved) {
      window.library.setSituation("click");
      window.library.openChat();
    } else {
      window.library.setSituation("idle");
    }
  });

  img.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    window.library.quit();
  });
})();
