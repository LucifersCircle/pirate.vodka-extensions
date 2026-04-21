import {
  EditSection,
  Form,
  LabelRow,
  Section,
  type FormItemElement,
  type FormSectionElement,
  type SelectorID,
} from "@paperback/types";
import { getDiscoverSectionDefinition } from "../../shared/utils";
import {
  getDiscoverSectionOrder,
  getHiddenDiscoverSections,
  setDiscoverSectionOrder,
  setHiddenDiscoverSections,
} from "./main";

export class DiscoverSettingsForm extends Form {
  private hiddenSectionRowSelectHandlers: Record<string, { handleSelect: () => Promise<void> }> =
    {};

  override getSections(): FormSectionElement<unknown>[] {
    const visibleSectionIds = this.getVisibleSectionIds();
    const hiddenSectionIds = this.getHiddenSectionIds();
    const sections: FormSectionElement<unknown>[] = [];
    this.hiddenSectionRowSelectHandlers = {};

    if (visibleSectionIds.length > 0) {
      sections.push(
        EditSection("visible-discover-sections", {
          id: "visible-discover-sections",
          header: "Visible Sections",
          footer: "Long press to reorder. Swipe to remove",
          items: visibleSectionIds.map((sectionId) => this.sectionRow(sectionId)),
          onDeletion: Application.Selector(
            this as DiscoverSettingsForm,
            "handleVisibleSectionDelete",
          ),
          onReorder: Application.Selector(
            this as DiscoverSettingsForm,
            "handleVisibleSectionReorder",
          ),
        }),
      );
    }

    if (hiddenSectionIds.length > 0) {
      sections.push(
        Section(
          {
            id: "hidden-discover-sections",
            header: "Hidden Sections",
            footer: "Tap to restore section",
          },
          hiddenSectionIds.map((sectionId) => this.hiddenSectionRow(sectionId)),
        ),
      );
    }

    return sections;
  }

  private getVisibleSectionIds(): string[] {
    const hiddenSections = getHiddenDiscoverSections();

    return getDiscoverSectionOrder().filter((sectionId) => !hiddenSections.includes(sectionId));
  }

  private getHiddenSectionIds(): string[] {
    const hiddenSections = getHiddenDiscoverSections();

    return getDiscoverSectionOrder().filter((sectionId) => hiddenSections.includes(sectionId));
  }

  private sectionRow(
    sectionId: string,
    onSelect?: SelectorID<() => Promise<void>>,
  ): FormItemElement<unknown> {
    const section = getDiscoverSectionDefinition(sectionId);

    return LabelRow(`discover-section-${sectionId}`, {
      title: section?.title ?? sectionId,
      onSelect,
    });
  }

  private hiddenSectionRow(sectionId: string): FormItemElement<unknown> {
    const handler = {
      handleSelect: async (): Promise<void> => {
        this.restoreHiddenSection(sectionId);
      },
    };

    this.hiddenSectionRowSelectHandlers[sectionId] = handler;

    return this.sectionRow(sectionId, Application.Selector(handler, "handleSelect"));
  }

  private saveSectionLists(visibleSections: string[], hiddenSections: string[]): void {
    setHiddenDiscoverSections(hiddenSections);
    setDiscoverSectionOrder([...visibleSections, ...hiddenSections]);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  private moveSection(
    sectionIds: string[],
    sourceIndex: number,
    destinationIndex: number,
    fallbackSectionId?: string,
  ): string[] {
    const sectionId = sectionIds[sourceIndex] ?? fallbackSectionId;
    if (!sectionId) {
      return sectionIds;
    }

    const nextSectionIds = [...sectionIds];
    this.removeSection(nextSectionIds, sourceIndex, sectionId);
    nextSectionIds.splice(destinationIndex, 0, sectionId);

    return nextSectionIds;
  }

  private removeSection(sectionIds: string[], index: number, sectionId: string): void {
    const existingIndex = sectionIds[index] === sectionId ? index : sectionIds.indexOf(sectionId);
    if (existingIndex >= 0) {
      sectionIds.splice(existingIndex, 1);
    }
  }

  private getSectionIdFromCallbackArgs(args: unknown[]): string | undefined {
    for (const arg of args) {
      if (typeof arg === "string") {
        return this.normalizeCallbackSectionId(arg);
      }

      if (typeof arg === "object" && arg !== null && "id" in arg) {
        const rowId = (arg as { id?: unknown }).id;
        if (typeof rowId === "string") {
          return this.normalizeCallbackSectionId(rowId);
        }
      }
    }

    return undefined;
  }

  private getCallbackIndexes(args: unknown[]): number[] {
    return args.filter((arg): arg is number => typeof arg === "number");
  }

  private normalizeCallbackSectionId(value: string): string | undefined {
    const sectionId = value.startsWith("discover-section-")
      ? value.slice("discover-section-".length)
      : value;

    return getDiscoverSectionDefinition(sectionId) ? sectionId : undefined;
  }

  async handleVisibleSectionReorder(...args: unknown[]): Promise<void> {
    const [sourceIndex, destinationIndex] = this.getCallbackIndexes(args);
    if (sourceIndex === undefined || destinationIndex === undefined) {
      return;
    }

    const sectionId = this.getSectionIdFromCallbackArgs(args);

    this.saveSectionLists(
      this.moveSection(this.getVisibleSectionIds(), sourceIndex, destinationIndex, sectionId),
      this.getHiddenSectionIds(),
    );
  }

  async handleVisibleSectionDelete(...args: unknown[]): Promise<void> {
    const visibleSections = this.getVisibleSectionIds();
    const [index = -1] = this.getCallbackIndexes(args);
    const sectionId = this.getSectionIdFromCallbackArgs(args);
    const deletedSectionId = sectionId ?? visibleSections[index];
    if (!deletedSectionId) {
      return;
    }

    this.removeSection(visibleSections, index, deletedSectionId);
    this.saveSectionLists(visibleSections, [...this.getHiddenSectionIds(), deletedSectionId]);
  }

  private restoreHiddenSection(sectionId: string): void {
    const hiddenSections = this.getHiddenSectionIds();
    if (!hiddenSections.includes(sectionId)) {
      return;
    }

    this.removeSection(hiddenSections, hiddenSections.indexOf(sectionId), sectionId);
    this.saveSectionLists([...this.getVisibleSectionIds(), sectionId], hiddenSections);
  }
}
