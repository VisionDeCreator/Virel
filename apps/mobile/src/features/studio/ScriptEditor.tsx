import { useState, useEffect } from "react";
import { Text, View, Image } from "react-native";
import { type useStudio, type Id } from "@virel/api-client";
import { Button, Field } from "@virel/ui-native";
import {
  scriptReferences,
  bindReference,
  renameReference,
  replaceReference,
  removeReference,
  referenceLimit,
} from "@virel/shared";
import { styles } from "../../components/Screen";
type Studio = ReturnType<typeof useStudio>;
function Thumbnail({ id, studio }: { id: string; studio: Studio }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    void studio
      .preview({ assetId: id as Id<"mediaAssets"> })
      .then((url) => {
        if (live) setUrl(url);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, studio.preview]);
  return url ? (
    <Image
      source={{ uri: url }}
      style={{ width: 80, height: 80, borderRadius: 10 }}
      accessibilityLabel="Reference preview"
    />
  ) : null;
}
export function NativeScriptEditor({ studio }: { studio: Studio }) {
  const { input, scripts, busy } = studio;
  const refs = scriptReferences(input);
  const [selection, setSelection] = useState({
    start: input.prompt.length,
    end: input.prompt.length,
  });
  const [history, setHistory] = useState("");
  const query = input.prompt
    .slice(0, selection.start)
    .match(/(?:^|\s)@([\w]*)$/);
  function attempt(operation: () => void) {
    try {
      operation();
    } catch (error) {
      studio.setError(
        error instanceof Error ? error.message : "Could not update reference.",
      );
    }
  }
  function insert(asset: NonNullable<Studio["assets"]>[number]) {
    attempt(() => {
      if (
        asset.type === "image" &&
        !input.referenceAssetIds.includes(asset._id) &&
        input.referenceAssetIds.length >= referenceLimit(input.mode)
      )
        throw new Error("Remove a reference image before adding another.");
      const next = { ...input, ...bindReference(input, asset._id, asset.type) };
      const alias = scriptReferences(next).find(
        (ref) => ref.assetId === asset._id,
      )!.alias;
      const start = query
        ? selection.start - query[1].length - 1
        : Math.min(selection.start, input.prompt.length);
      const text = `@${alias} `;
      studio.change({
        ...next,
        prompt:
          input.prompt.slice(0, start) +
          text +
          input.prompt.slice(selection.end),
      });
      setSelection({ start: start + text.length, end: start + text.length });
    });
  }
  const historical = scripts.versions?.find(
    (version) => version._id === history,
  );
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {scripts.status}
      </Text>
      {!!scripts.error && (
        <>
          <Text accessibilityRole="alert" style={styles.text}>
            {scripts.error}
          </Text>
          {scripts.recovery && (
            <Button
              title="Recover local draft"
              disabled={busy}
              onPress={scripts.recoverLocal}
            />
          )}
          <Button
            title="Retry save"
            disabled={busy}
            onPress={() => void studio.run(scripts.flush)}
          />
          <Button
            title="Reload saved script"
            disabled={busy}
            onPress={() => void studio.run(scripts.reload)}
          />
        </>
      )}
      <Field
        label={input.mode === "remix" ? "What would you change?" : "Script"}
        value={input.prompt}
        onChangeText={(prompt) => studio.change({ prompt })}
        onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
        editable={!busy}
        multiline
        maxLength={4000}
        style={{ minHeight: 160, textAlignVertical: "top" }}
        placeholder="Describe the action, camera, and sound. Type @ to link an image or video."
      />
      {query &&
        studio.assets
          ?.filter((asset) =>
            asset.name.toLowerCase().includes(query[1].toLowerCase()),
          )
          .slice(0, 6)
          .map((asset) => (
            <Button
              key={asset._id}
              title={`Link ${asset.name}`}
              disabled={busy}
              variant="secondary"
              onPress={() => insert(asset)}
            />
          ))}
      <Text style={styles.text}>
        {input.prompt.length}/4,000 · Insert references below or type @.
      </Text>
      {refs.map((ref) => (
        <View key={ref.assetId} style={{ gap: 10, paddingVertical: 10 }}>
          {ref.type === "image" && (
            <Thumbnail id={ref.assetId} studio={studio} />
          )}
          <Text style={styles.label}>
            {studio.assets?.find((asset) => asset._id === ref.assetId)?.name ??
              "Selected video"}
          </Text>
          <Button
            title={`Insert @${ref.alias}`}
            disabled={busy}
            variant="secondary"
            onPress={() => {
              const asset = studio.assets?.find(
                (asset) => asset._id === ref.assetId,
              );
              if (asset) insert(asset);
            }}
          />
          <Field
            key={ref.alias}
            label={`Reference name ${ref.alias}`}
            defaultValue={ref.alias}
            editable={!busy}
            onEndEditing={(event) => {
              const alias = event.nativeEvent.text.trim();
              if (alias !== ref.alias)
                attempt(() =>
                  studio.change(renameReference(input, ref.assetId, alias)),
                );
            }}
          />
          <Button
            title={`Remove @${ref.alias}`}
            disabled={busy}
            variant="secondary"
            onPress={() => studio.change(removeReference(input, ref.assetId))}
          />
          {studio.assets
            ?.filter(
              (asset) =>
                asset.type === ref.type &&
                !refs.some((ref) => ref.assetId === asset._id),
            )
            .slice(0, 3)
            .map((asset) => (
              <Button
                key={asset._id}
                title={`Replace @${ref.alias} with ${asset.name}`}
                disabled={busy}
                variant="secondary"
                onPress={() =>
                  attempt(() =>
                    studio.change(
                      replaceReference(input, ref.assetId, asset._id),
                    ),
                  )
                }
              />
            ))}
        </View>
      ))}
      <Text style={styles.label}>Script history</Text>
      {scripts.versions?.slice(0, 10).map((version) => (
        <Button
          key={version._id}
          title={`Preview version ${version.revision}`}
          variant="secondary"
          onPress={() => setHistory(version._id)}
        />
      ))}
      {historical && (
        <>
          <Text style={styles.text}>
            Preview only: {historical.input.prompt}
          </Text>
          <Button
            title="Use this version as draft"
            disabled={busy}
            onPress={() => {
              scripts.restore(historical);
              setHistory("");
            }}
          />
        </>
      )}
    </View>
  );
}
