"use client";

import { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { useApp } from "@/components/app-context";
import { Button, Field, Label, Modal, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import type { MediaAsset } from "@/lib/types";

const ASPECTS = [
  { v: "1:1", label: "Square 1:1" },
  { v: "4:5", label: "Portrait 4:5" },
  { v: "9:16", label: "Story 9:16" },
  { v: "16:9", label: "Wide 16:9" },
];
const STYLES = [
  { v: "photo", label: "Photo" },
  { v: "illustration", label: "Illustration" },
  { v: "minimal", label: "Minimal" },
  { v: "poster", label: "Bold poster" },
];

/** Generates an image with the Gemini image model and saves it to the media library. */
export function AiImageModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (asset: MediaAsset, url: string | null) => void;
}) {
  const { workspace } = useApp();
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [style, setStyle] = useState("photo");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ asset: MediaAsset; url: string | null } | null>(null);

  const generate = async () => {
    if (!prompt.trim()) return toast("Describe the image you want", "error");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, prompt, aspect, style }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Image generation failed");
      setResult(json);
      toast("Image saved to your media library");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Image generation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setResult(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Generate image with AI"
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={() => setResult(null)}>
              Generate another
            </Button>
            <Button
              onClick={() => {
                onCreated?.(result.asset, result.url);
                close();
              }}
            >
              Use this image
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={generate} loading={busy}>
              <Wand2 className="size-4" /> Generate (5 credits)
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          {result.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.url} alt={prompt} className="mx-auto max-h-[60dvh] w-auto rounded-2xl border border-line" />
          ) : (
            <p className="text-sm text-muted">Saved — open the media library to view it.</p>
          )}
          <p className="text-xs text-faint">AI-generated · labelled &ldquo;AI&rdquo; in your media library. Review before publishing.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Describe the image">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A bright gym studio at sunrise with kettlebells on the floor"
              maxLength={1500}
            />
          </Field>
          <div>
            <Label>Aspect ratio</Label>
            <div className="flex flex-wrap gap-2">
              {ASPECTS.map((a) => (
                <button
                  key={a.v}
                  type="button"
                  onClick={() => setAspect(a.v)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    aspect === a.v ? "border-brand bg-brand/15 text-brand-ink" : "border-line-2 text-muted hover:text-ink",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Style</Label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => setStyle(s.v)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    style === s.v ? "border-brand bg-brand/15 text-brand-ink" : "border-line-2 text-muted hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-panel-2 p-3 text-xs text-muted">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand-ink" />
            Uses the Gemini image model (needs GEMINI_API_KEY). No text, logos or real people are added unless you ask, and your
            brand&apos;s forbidden claims are respected.
          </p>
        </div>
      )}
    </Modal>
  );
}
