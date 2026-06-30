document.querySelectorAll("[data-collapse]").forEach((trigger) => {
  const targetId = trigger.getAttribute("data-collapse");
  const target = document.getElementById(targetId);
  if (!target) return;

  trigger.addEventListener("click", () => {
    const isOpen = target.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(isOpen));
  });
});

document.querySelectorAll(".file-input-wrap input[type=file]").forEach((input) => {
  const label = input.closest(".file-input-wrap")?.querySelector(".file-label");
  if (!label) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    label.textContent = file ? file.name : "Escolher PDF…";
  });
});
