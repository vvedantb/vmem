"use client";

import { useState } from "react";
import {
  Button,
  Progress,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import {
  IconUpload,
  IconFile,
  IconPhoto,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconDotsVertical,
  IconDownload,
  IconTrash,
  IconEye,
} from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";

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
    <PageContainer
      title="Files"
      description="Manage your uploaded files and documents"
    >
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
            <Progress
              value={storagePercent}
              size="sm"
              classNames={{
                track: "bg-black/10 dark:bg-white/10",
                indicator: "bg-black dark:bg-white",
              }}
            />
          </div>
          <Button
            startContent={<IconUpload size={18} stroke={1.5} />}
            className="bg-black dark:bg-white text-white dark:text-black font-medium"
          >
            Upload File
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-black dark:text-white mb-4">
          Your Files
        </h3>
        <Table
          aria-label="Files table"
          classNames={{
            wrapper:
              "border border-black/10 dark:border-white/10 rounded-xl shadow-none bg-transparent",
            th: "bg-black/[0.02] dark:bg-white/[0.02] text-neutral-500 font-medium",
            td: "py-4",
          }}
        >
          <TableHeader>
            <TableColumn>NAME</TableColumn>
            <TableColumn className="hidden md:table-cell">SIZE</TableColumn>
            <TableColumn className="hidden md:table-cell">UPLOADED</TableColumn>
            <TableColumn width={60}>
              <span className="sr-only">Actions</span>
            </TableColumn>
          </TableHeader>
          <TableBody>
            {mockFiles.map((file) => {
              const FileIcon = getFileIcon(file.type);
              return (
                <TableRow key={file.id}>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-neutral-500">
                      {file.size}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-neutral-500">
                      {file.uploadedAt}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          isIconOnly
                          variant="light"
                          size="sm"
                          className="text-neutral-500"
                        >
                          <IconDotsVertical size={18} stroke={1.5} />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="File actions">
                        <DropdownItem
                          key="view"
                          startContent={<IconEye size={16} stroke={1.5} />}
                        >
                          View
                        </DropdownItem>
                        <DropdownItem
                          key="download"
                          startContent={<IconDownload size={16} stroke={1.5} />}
                        >
                          Download
                        </DropdownItem>
                        <DropdownItem
                          key="delete"
                          className="text-danger"
                          color="danger"
                          startContent={<IconTrash size={16} stroke={1.5} />}
                        >
                          Delete
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </PageContainer>
  );
}
