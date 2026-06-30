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

const modal = document.getElementById("confirm-modal");
const modalForm = document.getElementById("modal-form");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");

function openModal({ title, message, action }) {
  if (!modal || !modalForm) return;
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalForm.action = action;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal() {
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

document.querySelectorAll("[data-confirm-delete]").forEach((btn) => {
  btn.addEventListener("click", () => {
    openModal({
      title: btn.dataset.confirmTitle || "Confirmar exclusão",
      message: btn.dataset.confirmMessage || "Tem certeza que deseja excluir?",
      action: btn.dataset.confirmAction,
    });
  });
});

modal?.querySelectorAll("[data-modal-close]").forEach((el) => {
  el.addEventListener("click", closeModal);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && !modal.hidden) {
    closeModal();
  }
});
