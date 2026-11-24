"use client";

import { useState } from "react";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

export function LogoUpload({ currentUrl }: { currentUrl: string | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) {
      setPreview(null);
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setError("Use a PNG, JPEG or WebP image.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("The logo must be 2 MB or smaller.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {preview || currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview ?? currentUrl ?? ""} alt="Organization logo preview" className="h-20 w-20 rounded-xl bg-white object-contain p-1 ring-1 ring-evergreen-900/15" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-cream text-xs text-ink-soft ring-1 ring-evergreen-900/15">
            No logo
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-evergreen-950">{preview ? "New logo preview" : currentUrl ? "Current logo" : "No logo yet"}</p>
          <p className="text-xs text-ink-soft">PNG, JPEG or WebP · up to 2 MB. The new logo appears on your dashboard, portal, examination papers and candidate screens.</p>
        </div>
      </div>
      <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" onChange={onChange} className="block w-full text-sm" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
