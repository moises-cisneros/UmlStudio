// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  DropdownMenu,
  DropdownMenuContent,
} from "@umlstudio/ui/components/dropdown-menu";
import { VisionPhotoImportItem } from "./VisionPhotoImportItem";

function renderItem(props: { close?: () => void; onImportPhoto?: () => void }) {
  return render(
    <DropdownMenu defaultOpen>
      <DropdownMenuContent>
        <VisionPhotoImportItem
          close={props.close ?? (() => {})}
          onImportPhoto={props.onImportPhoto ?? (() => {})}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe("VisionPhotoImportItem", () => {
  it("renders the photo import entry in the Import group", () => {
    renderItem({});
    expect(
      screen.getByRole("menuitem", { name: /importar desde imagen/i }),
    ).toBeTruthy();
  });

  it("opens the vision flow and closes the menu on click", () => {
    const onImportPhoto = vi.fn();
    const close = vi.fn();
    renderItem({ close, onImportPhoto });
    fireEvent.click(
      screen.getByRole("menuitem", { name: /importar desde imagen/i }),
    );
    expect(onImportPhoto).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
