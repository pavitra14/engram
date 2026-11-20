/**
 * The pieces Settings is built from: groups that open and close, sections inside
 * them, rows, and a search that filters all of it. Search reads the rows' own
 * words from the element tree, so a row is found by exactly what it says.
 */
import { Feather } from "@expo/vector-icons";
import {
  Children,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { RoundButton } from "@/components/ui";
import { font, type, useTheme } from "@/theme";

/** How a row should behave right now: shown always, or only if it matches the search. */
type Filter = { query: string; showAll: boolean };
const FilterContext = createContext<Filter>({ query: "", showAll: true });

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** True when every word of the search appears somewhere in the text. */
export function matches(text: string, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = norm(text);
  return words.every((w) => hay.includes(w));
}

export function Row({
  title,
  sub,
  action,
  onPress,
  danger,
}: {
  title: string;
  sub: string;
  action: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { c } = useTheme();
  const f = useContext(FilterContext);
  if (!f.showAll && !matches(`${title} ${sub}`, f.query)) return null;
  return (
    <View style={[styles.row, { borderTopColor: c.rule }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: c.ink }]}>{title}</Text>
        <Text style={[type.meta, { color: c.soft }]}>{sub}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action}: ${title}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.action,
          {
            backgroundColor: c.surface,
            borderColor: c.line,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <Text style={[type.smallStrong, { color: danger ? c.danger : c.ink }]}>
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

/** Explaining text and controls that are not rows. While searching, shown only with a section found by its own name. */
export function Extra({ children }: { children: ReactNode }) {
  const f = useContext(FilterContext);
  return f.showAll ? <>{children}</> : null;
}

/** The words of every Row inside an element tree, without drawing it. */
function rowWords(node: ReactNode, out: string[] = []): string[] {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{
      title?: string;
      sub?: string;
      children?: ReactNode;
    }>;
    if (el.type === Row)
      out.push(`${el.props.title ?? ""} ${el.props.sub ?? ""}`);
    else if (el.props.children) rowWords(el.props.children, out);
  });
  return out;
}

type SectionProps = { title: string; terms?: string; children: ReactNode };

/** Whether a section has anything to show for a search: its name, its extra terms, or one of its rows. */
function sectionMatch(p: SectionProps, query: string): "all" | "rows" | null {
  if (matches(`${p.title} ${p.terms ?? ""}`, query)) return "all";
  return rowWords(p.children).some((w) => matches(w, query)) ? "rows" : null;
}

/**
 * A titled block of settings. `terms` are other words people might search for
 * it by, for sections whose controls are not rows (the theme, for example).
 */
export function Section(p: SectionProps) {
  const { c } = useTheme();
  const f = useContext(FilterContext);
  const found = f.query ? sectionMatch(p, f.query) : "all";
  if (!found) return null;
  return (
    <FilterContext.Provider
      value={{ query: f.query, showAll: !f.query || found === "all" }}
    >
      <View style={{ gap: 10 }}>
        <Text style={[type.labelStrong, { color: c.ink }]}>{p.title}</Text>
        {p.children}
      </View>
    </FilterContext.Provider>
  );
}

function groupHas(children: ReactNode, query: string): boolean {
  let any = false;
  Children.forEach(children, (child) => {
    if (any || !isValidElement(child)) return;
    if (
      child.type === Section &&
      sectionMatch(child.props as SectionProps, query)
    )
      any = true;
  });
  return any;
}

/**
 * A group of sections behind a header that opens and closes. While searching,
 * groups with a match open by themselves and the rest are hidden.
 */
export function Group({
  id,
  title,
  sub,
  open,
  onToggle,
  query,
  children,
}: {
  id: string;
  title: string;
  sub: string;
  open: boolean;
  onToggle: (id: string) => void;
  query: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const searching = query.trim().length > 0;
  if (searching && !groupHas(children, query)) return null;
  const shown = searching || open;
  return (
    <View
      style={[styles.group, { borderColor: c.line, backgroundColor: c.bg }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: shown }}
        accessibilityLabel={`${title}. ${sub}`}
        accessibilityHint={
          shown ? "Hides these settings" : "Shows these settings"
        }
        disabled={searching}
        onPress={() => onToggle(id)}
        style={({ pressed }) => [
          styles.groupHead,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={[
              type.bodyStrong,
              { color: c.ink, fontFamily: font.semibold },
            ]}
          >
            {title}
          </Text>
          {shown ? null : (
            <Text style={[type.meta, { color: c.soft }]} numberOfLines={1}>
              {sub}
            </Text>
          )}
        </View>
        {searching ? null : (
          <Feather
            name={shown ? "chevron-up" : "chevron-down"}
            size={20}
            color={c.soft}
          />
        )}
      </Pressable>
      {shown ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.groupBody}>
          <FilterContext.Provider
            value={{ query: searching ? query : "", showAll: !searching }}
          >
            {children}
          </FilterContext.Provider>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Holds the groups, and says so plainly when a search finds nothing in any of them. */
export function Groups({
  query,
  children,
}: {
  query: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const q = query.trim();
  let found = !q;
  if (q) {
    Children.forEach(children, (child) => {
      if (
        !found &&
        isValidElement(child) &&
        child.type === Group &&
        groupHas((child.props as { children: ReactNode }).children, q)
      )
        found = true;
    });
  }
  return (
    <View style={{ gap: 12 }}>
      {children}
      {found ? null : (
        <View
          style={{ gap: 4, paddingVertical: 12 }}
          accessibilityLiveRegion="polite"
        >
          <Text style={[type.bodyStrong, { color: c.ink }]}>
            No settings match
          </Text>
          <Text style={[type.meta, { color: c.soft }]}>
            Try another word, such as backup, reminder or theme.
          </Text>
        </View>
      )}
    </View>
  );
}

export function SettingsSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.field,
        { backgroundColor: c.surface, borderColor: value ? c.accent : c.line },
      ]}
    >
      <Feather name="search" size={18} color={c.soft} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Find a setting"
        placeholderTextColor={c.faint}
        accessibilityLabel="Find a setting"
        returnKeyType="search"
        autoCorrect={false}
        style={[styles.input, { color: c.ink }]}
        selectionColor={c.accent}
      />
      {value ? (
        <RoundButton
          icon="x"
          label="Clear search"
          tone="plain"
          onPress={() => onChange("")}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 68,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  action: {
    height: 48,
    minWidth: 92,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  group: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  groupHead: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  groupBody: { paddingHorizontal: 18, paddingBottom: 18, gap: 26 },
  field: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 18,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 16,
    paddingVertical: 0,
  },
});
