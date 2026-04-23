import { Node, mergeAttributes } from "@tiptap/core";

export interface GoogleDriveEmbedOptions {
  HTMLAttributes: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    googleDriveEmbed: {
      setGoogleDriveEmbed: (options: { src: string; width?: string; height?: string }) => ReturnType;
    };
  }
}

export const GoogleDriveEmbed = Node.create<GoogleDriveEmbedOptions>({
  name: "googleDriveEmbed",
  group: "block",
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: { default: null },
      width: { default: "100%" },
      height: { default: "480px" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'iframe[data-google-drive="true"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { class: "google-drive-embed", style: "position: relative; margin: 1em 0;" },
      [
        "iframe",
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          "data-google-drive": "true",
          frameborder: "0",
          allowfullscreen: "true",
          style: `width: ${HTMLAttributes.width}; height: ${HTMLAttributes.height}; border-radius: 8px; border: 1px solid #e5e7eb;`,
        }),
      ],
    ];
  },

  addCommands() {
    return {
      setGoogleDriveEmbed:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

export function parseGoogleDriveUrl(url: string): string | null {
  // Google Docs
  let match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://docs.google.com/document/d/${match[1]}/preview`;

  // Google Sheets
  match = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://docs.google.com/spreadsheets/d/${match[1]}/preview`;

  // Google Slides
  match = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://docs.google.com/presentation/d/${match[1]}/embed`;

  // Google Drive file (video, PDF, etc.)
  match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;

  // Google Drive open link
  match = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;

  // YouTube
  match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (match) return `https://www.youtube.com/embed/${match[1]}`;

  // Already an embed URL
  if (url.includes("/preview") || url.includes("/embed")) return url;

  return null;
}
