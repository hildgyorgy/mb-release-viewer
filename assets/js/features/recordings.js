// Jump-start placeholder.
// A recordings-építő nagy blokkot a következő körben tesszük át ide.

export async function buildRecordingsView() {
  const view = document.querySelector(`section.view[data-view="recordings"]`);
  if (!view) return;
  view.innerHTML = `<div class="muted">Recordings view (module) – next step</div>`;
}