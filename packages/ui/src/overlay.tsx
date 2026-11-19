import { useEffect } from "react";
import type { ComponentPropsWithRef, Ref, SyntheticEvent } from "react";
import { styled, t } from "@vespoli/styled";
import { morphClose, morphOpen } from "./transitions.ts";

const DialogBox = styled.dialog`
  margin: auto;
  max-width: min(560px, calc(100vw - 32px));
  width: 100%;
  padding: ${t.space[5]} ${t.space[6]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.lg};
  background: ${t.color.overlay};

  &::backdrop {
    background: #05080cb8;
  }
`;

export interface DialogProps
  extends Omit<ComponentPropsWithRef<"dialog">, "open" | "onClose"> {
  open: boolean;
  onClose?: () => void;
  loading?: boolean;
}

function assignRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(node);
  } else {
    (ref as { current: T | null }).current = node;
  }
}

function syncDialogElement(el: HTMLDialogElement | null, open: boolean): void {
  if (!el) return;
  const isOpen = Boolean(el.open);
  if (open && !isOpen) {
    if (typeof el.showModal === "function") {
      void morphOpen(el, () => {
        el.showModal();
      });
    } else {
      el.setAttribute("open", "");
    }
  } else if (!open && isOpen) {
    if (typeof el.close === "function") {
      void morphClose(el, () => {
        el.close();
      });
    } else {
      el.removeAttribute("open");
    }
  }
}

export function Dialog({
  open,
  onClose,
  loading = false,
  onCancel,
  ref,
  className,
  ...props
}: DialogProps) {
  let elementRef: HTMLDialogElement | null = null;

  useEffect(() => {
    syncDialogElement(elementRef, open);
  }, [open]);

  const bindRef = (node: HTMLDialogElement | null) => {
    elementRef = node;
    assignRef(ref, node);
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement, Event>) => {
    onCancel?.(event);
    event.preventDefault();
    onClose?.();
  };

  const handleNativeClose = () => {
    if (open) {
      onClose?.();
    }
  };

  return (
    <DialogBox
      ref={bindRef}
      data-vui-morph-target={open ? "dialog" : undefined}
      data-loading={loading ? "true" : undefined}
      aria-busy={loading ? true : undefined}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      className={className}
      {...props}
    />
  );
}

export interface InspectorStyle {
  drawer?: "right" | "bottom";
}

const InspectorBox = styled.dialog<InspectorStyle>`
  margin: 0 0 0 auto;
  height: 100dvh;
  max-height: 100dvh;
  width: min(440px, 100vw);
  padding: ${t.space[5]} ${t.space[5]};
  border: 0;
  border-left: 1px solid ${t.color.border};
  background: ${t.color.overlay};

  &::backdrop {
    background: #05080cb8;
  }

  ${p => p.drawer === "bottom" && css`
    margin: auto 0 0 0;
    width: 100vw;
    max-width: 100vw;
    height: min(420px, 80dvh);
    border-left: 0;
    border-top: 1px solid ${t.color.border};
  `}
`;

export interface InspectorProps
  extends Omit<ComponentPropsWithRef<"dialog">, "open" | "onClose"> {
  open: boolean;
  onClose?: () => void;
  loading?: boolean;
  drawer?: "right" | "bottom";
}

export function Inspector({
  open,
  onClose,
  loading = false,
  drawer = "right",
  onCancel,
  ref,
  className,
  ...props
}: InspectorProps) {
  let elementRef: HTMLDialogElement | null = null;

  useEffect(() => {
    syncDialogElement(elementRef, open);
  }, [open]);

  const bindRef = (node: HTMLDialogElement | null) => {
    elementRef = node;
    assignRef(ref, node);
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement, Event>) => {
    onCancel?.(event);
    event.preventDefault();
    onClose?.();
  };

  const cls =
    `vui-Inspector--drawer-${drawer}` + (className ? " " + className : "");

  return (
    <InspectorBox
      ref={bindRef}
      data-vui-morph-target={open ? "inspector" : undefined}
      data-loading={loading ? "true" : undefined}
      aria-busy={loading ? true : undefined}
      onCancel={handleCancel}
      onClose={() => {
        if (open) onClose?.();
      }}
      className={cls}
      {...props}
    />
  );
}
