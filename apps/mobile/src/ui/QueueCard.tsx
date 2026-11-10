import { Button } from "@vvedantb/native-ui/button";
import { Badge, Card, Text, Textarea } from "@vvedantb/native-ui/primitives";
import { useState } from "react";
import { View } from "react-native";
import type { CaptureKind, QueueRow } from "../../modules/vmem-tracker";
import { trackerActions } from "../sync/store";
import { MAX_ATTEMPTS, parseBody } from "../sync/upload";
import { localRange } from "./format";
import { textColor, useScheme } from "./theme";

const KIND_LABEL: Record<CaptureKind, string> = {
  app_usage: "App use",
  share: "Shared",
  note: "Note",
  clipboard: "Clipboard",
  screen_text: "Screen text",
  notification: "Notification",
};

function StatusBadge({ row }: { row: QueueRow }) {
  if (row.status === "uploaded") return <Badge variant="success">Sent</Badge>;
  if (row.status === "approved") {
    return row.attempts >= MAX_ATTEMPTS ? (
      <Badge variant="destructive-soft">Not sent</Badge>
    ) : (
      <Badge variant="secondary">Sending</Badge>
    );
  }
  return null;
}

/** One review item: what will be saved to vmem, exactly as it will be sent. */
export function QueueCard({ row }: { row: QueueRow }) {
  const scheme = useScheme();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const body = parseBody(row);
  const stuck = row.status === "approved" && row.attempts >= MAX_ATTEMPTS;

  return (
    <Card
      title={body?.title ?? "Unreadable item"}
      description={`${KIND_LABEL[row.kind]} · ${localRange(row.startMs, row.endMs)}`}
      action={<StatusBadge row={row} />}
    >
      <View className="gap-3">
        <Text
          variant="muted"
          style={textColor(scheme, "muted")}
          numberOfLines={expanded ? undefined : 3}
        >
          {body?.content ?? ""}
        </Text>
        {row.status === "pending_review" && row.kind === "share" ? (
          <View className="gap-2">
            <Textarea
              value={note}
              onChangeText={setNote}
              placeholder="Add a note to this share"
              numberOfLines={2}
              accessibilityLabel="Note for this share"
            />
            <Button
              size="sm"
              variant="outline"
              fullWidth={false}
              disabled={note.trim().length === 0}
              onPress={() => {
                void trackerActions.addShareNote(row, note);
                setNote("");
              }}
            >
              Add note
            </Button>
          </View>
        ) : null}
        {row.lastError && row.status === "approved" ? (
          <Text variant="small" className="text-destructive">
            {row.lastError}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          {row.status === "pending_review" ? (
            <>
              <Button
                size="sm"
                fullWidth={false}
                onPress={() => void trackerActions.approve([row.id])}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                fullWidth={false}
                onPress={() => void trackerActions.discard([row.id])}
              >
                Discard
              </Button>
            </>
          ) : null}
          {stuck ? (
            <>
              <Button
                size="sm"
                fullWidth={false}
                onPress={() => void trackerActions.retry([row.id])}
              >
                Try again
              </Button>
              <Button
                size="sm"
                variant="outline"
                fullWidth={false}
                onPress={() => void trackerActions.discard([row.id])}
              >
                Discard
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            fullWidth={false}
            onPress={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : "Show all"}
          </Button>
        </View>
      </View>
    </Card>
  );
}
