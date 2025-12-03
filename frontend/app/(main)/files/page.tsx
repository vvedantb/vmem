"use client";

import { useState } from "react";
import {
  IconUpload,
  IconFile,
  IconPhoto,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconDotsVertical,
} from "@tabler/icons-react";

const mockFiles = [
  {
    id: "1",
    name: "Project Requirements.pdf",
    type: "pdf",
    size: "2.4 MB",
    uploadedAt: "Dec 2, 2025",
  },
  {
    id: "2",
    name: "Team Photo.jpg",
    type: "image",
    size: "1.8 MB",
    uploadedAt: "Dec 1, 2025",
  },
  {
    id: "3",
    name: "Q4 Budget.xlsx",
    type: "excel",
    size: "856 KB",
    uploadedAt: "Nov 28, 2025",
  },
  {
    id: "4",
    name: "Meeting Notes.docx",
    type: "doc",
    size: "124 KB",
    uploadedAt: "Nov 25, 2025",
  },
  {
    id: "5",
    name: "Architecture Diagram.png",
    type: "image",
    size: "3.2 MB",
    uploadedAt: "Nov 20, 2025",
  },
];

const getFileIcon = (type: string) => {
  switch (type) {
    case "pdf":
      return IconFileTypePdf;
    case "image":
      return IconPhoto;
    case "doc":
      return IconFileTypeDoc;
    case "excel":
      return IconFileTypeXls;
    default:
      return IconFile;
  }
};

export default function FilesPage() {
  const [storageUsed] = useState(4.2);
  const storageTotal = 10;
  const storagePercent = (storageUsed / storageTotal) * 100;

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          Files
        </h2>
        <p className="text-neutral-500 mt-2">
          Manage your uploaded files and documents
        </p>
      </div>

      <div className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Storage Usage
              </span>
              <span className="text-sm text-neutral-500">
                {storageUsed} GB / {storageTotal} GB
              </span>
            </div>
            <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-black dark:bg-white rounded-full transition-all duration-500"
                style={{ width: `${storagePercent}%` }}
              />
            </div>
          </div>
          <button className="px-5 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors flex items-center gap-2">
            <IconUpload size={18} stroke={1.5} />
            Upload File
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-black dark:text-white mb-4">
          Your Files
        </h3>
        <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                  Size
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                  Uploaded
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider w-16">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mockFiles.map((file) => {
                const FileIcon = getFileIcon(file.type);
                return (
                  <tr
                    key={file.id}
                    className="border-b border-black/5 dark:border-white/5 last:border-0 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0">
                          <FileIcon
                            size={20}
                            stroke={1.5}
                            className="text-neutral-600 dark:text-neutral-400"
                          />
                        </div>
                        <span className="text-neutral-800 dark:text-neutral-200 font-medium">
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 hidden md:table-cell">
                      <span className="text-sm text-neutral-500">
                        {file.size}
                      </span>
                    </td>
                    <td className="px-6 py-5 hidden md:table-cell">
                      <span className="text-sm text-neutral-500">
                        {file.uploadedAt}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <button className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <IconDotsVertical
                          size={18}
                          stroke={1.5}
                          className="text-neutral-500"
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
