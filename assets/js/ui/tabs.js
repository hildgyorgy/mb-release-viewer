/* ============================================================
   Tabs UI: view switching + lazy build hook
   ============================================================ */

export function setActiveView(viewName) {
  document.querySelectorAll(".view").forEach((sec) => {
    sec.hidden = sec.dataset.view !== viewName;
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === viewName);
  });
}

/**
 * Bind tab click handlers once.
 *
 * @param {Object} opts
 * @param {(viewName: string) => Promise<void>|void} [opts.onViewActivated]
 */
export function bindTabsOnce({ onViewActivated } = {}) {
  const tabs = document.getElementById("tabs");
  if (!tabs) return;
  if (tabs.dataset.boundTabs === "1") return;
  tabs.dataset.boundTabs = "1";

  tabs.addEventListener("click", async (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;

    const view = btn.dataset.view;
    if (!view) return;

    setActiveView(view);

    if (typeof onViewActivated === "function") {
      await onViewActivated(view);
    }
  });
}