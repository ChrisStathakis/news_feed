// Απλό lightbox: κλικ σε εικόνα του οδηγού → πλήρες μέγεθος.
// Λειτουργεί και από file://, χωρίς εξωτερικά plugins.
(function () {
  function close(box) {
    box.remove();
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      var box = document.querySelector(".lightbox");
      if (box) close(box);
    }
  }

  function open(src, alt) {
    var box = document.createElement("div");
    box.className = "lightbox";
    var img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    box.appendChild(img);
    box.addEventListener("click", function () {
      close(box);
    });
    document.body.appendChild(box);
    document.addEventListener("keydown", onKey);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var imgs = document.querySelectorAll(".md-typeset figure img");
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        img.classList.add("is-zoomable");
        img.addEventListener("click", function () {
          open(img.currentSrc || img.src, img.alt);
        });
      })(imgs[i]);
    }
  });
})();
