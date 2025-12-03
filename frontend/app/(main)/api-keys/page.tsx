"use client";

import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { IconBolt } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";

const mockApiKeys = [
  {
    id: "1",
    name: "Production App",
    key: "vmem_sk_**********************a3f2",
    createdAt: "Nov 15, 2025",
    lastUsed: "2 hours ago",
  },
  {
    id: "2",
    name: "Development",
    key: "vmem_sk_**********************b7c1",
    createdAt: "Oct 28, 2025",
    lastUsed: "Yesterday",
  },
];

export default function ApiKeysPage() {
  return (
    <PageContainer
      title="API Keys"
      description="Manage your API keys for programmatic access"
    >
      <Card
        classNames={{
          base: "border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none",
        }}
      >
        <CardBody className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0">
              <IconBolt
                className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
                stroke={1.5}
              />
            </div>
            <div>
              <h3 className="font-medium text-black dark:text-white">
                MCP Integration
              </h3>
              <p className="text-sm text-neutral-500 mt-1">
                Use your API key to connect vMemory with MCP-compatible clients.
                Your memories will be accessible through the Model Context
                Protocol.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-black dark:text-white">
          Your API Keys
        </h3>
        <Button className="bg-black dark:bg-white text-white dark:text-black font-medium">
          Create New Key
        </Button>
      </div>

      <Table
        aria-label="API Keys table"
        classNames={{
          wrapper:
            "border border-black/10 dark:border-white/10 rounded-xl shadow-none bg-transparent",
          th: "bg-black/[0.02] dark:bg-white/[0.02] text-neutral-500 font-medium",
          td: "py-5",
        }}
      >
        <TableHeader>
          <TableColumn>NAME</TableColumn>
          <TableColumn className="hidden md:table-cell">KEY</TableColumn>
          <TableColumn>LAST USED</TableColumn>
          <TableColumn>ACTIONS</TableColumn>
        </TableHeader>
        <TableBody>
          {mockApiKeys.map((apiKey) => (
            <TableRow key={apiKey.id}>
              <TableCell>
                <span className="text-neutral-800 dark:text-neutral-200">
                  {apiKey.name}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <code className="text-sm text-neutral-500 font-mono">
                  {apiKey.key}
                </code>
              </TableCell>
              <TableCell>
                <span className="text-sm text-neutral-500">
                  {apiKey.lastUsed}
                </span>
              </TableCell>
              <TableCell>
                <Button
                  variant="light"
                  size="sm"
                  className="text-neutral-500 hover:text-black dark:hover:text-white"
                >
                  Revoke
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PageContainer>
  );
}
