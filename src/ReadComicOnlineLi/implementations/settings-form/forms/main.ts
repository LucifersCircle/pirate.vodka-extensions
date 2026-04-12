import { Form, type SettingsFormProviding } from "@paperback/types";
import { ReadComicOnlineLiSettingsForm } from "./landing";

export function getHiddenDiscoverSections(): string[] {
  return (
    (Application.getState("readcomiconlineli-hidden-discover-sections") as string[] | undefined) ??
    []
  );
}

export function setHiddenDiscoverSections(value: string[]): void {
  Application.setState(value, "readcomiconlineli-hidden-discover-sections");
}

export class SettingsFormProvider implements SettingsFormProviding {
  async getSettingsForm(): Promise<Form> {
    return new ReadComicOnlineLiSettingsForm();
  }
}
