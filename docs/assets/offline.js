// Αναζήτηση: χρειάζεται HTTP. Σε file:// (διπλό κλικ στο site/index.html)
// κρύβουμε το πεδίο για να μην εμφανίζεται σπασμένο.
(function () {
  if (location.protocol !== "file:") return;
  document.addEventListener("DOMContentLoaded", function () {
    var search = document.querySelector(".md-search");
    if (search) search.style.display = "none";
  });
})();
