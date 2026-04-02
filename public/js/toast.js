document.addEventListener("showToast", (e) => {
  const el = document.getElementById("toast");
  el.textContent = e.detail.value;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
});
