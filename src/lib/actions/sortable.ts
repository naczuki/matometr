import Sortable from 'sortablejs';

export interface SortableActionOptions {
  onSort: (oldIndex: number, newIndex: number) => void;
}

export function sortableAction(node: HTMLElement, options: SortableActionOptions): { destroy(): void } {
  const instance = Sortable.create(node, {
    animation: 200,
    delay: 400,
    delayOnTouchOnly: true,
    touchStartThreshold: 8,
    filter: 'input, textarea, button, a, select',
    preventOnFilter: false,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onUpdate: (evt) => {
      if (evt.oldIndex === undefined || evt.newIndex === undefined) return;
      const el = evt.item;
      const parent = evt.from;
      // Revert SortableJS's DOM change so Svelte can reconcile via keyed each
      if (evt.newIndex > evt.oldIndex) {
        parent.insertBefore(el, parent.children[evt.oldIndex]);
      } else {
        parent.insertBefore(el, parent.children[evt.oldIndex + 1] ?? null);
      }
      options.onSort(evt.oldIndex, evt.newIndex);
    }
  });

  return {
    destroy() {
      instance.destroy();
    }
  };
}
