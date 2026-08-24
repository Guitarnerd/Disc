import { useEffect, useMemo, useRef, useState } from "react";
import { useDisc } from "../context/DiscContext.jsx";
import ColorPicker from "./ColorPicker.jsx";
import Dropdown from "./Dropdown.jsx";
import Icon from "./Icon.jsx";
import "./TagManagerModal.css";

const COLOR_PICKER_WIDTH = 190;
const COLOR_PICKER_HEIGHT = 130;

export default function TagManagerModal({ onClose }) {
  const { tags, trackTags, onRenameTag, onRecolorTag, onDeleteTag, onMergeTags } = useDisc();

  const rootRef = useRef(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [colorPicker, setColorPicker] = useState(null); // { tagId, x, y, color } | null
  const [deleteArmedId, setDeleteArmedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [survivorId, setSurvivorId] = useState(null);
  const [mergeArmed, setMergeArmed] = useState(false);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // How many tracks currently carry each tag — surfaced so it's obvious
  // which of several near-identical tags is actually the one in use.
  const tagUsage = useMemo(() => {
    const counts = new Map();
    for (const ids of Object.values(trackTags)) {
      for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [trackTags]);

  // Deliberately exact-name (case/whitespace-insensitive) matching rather
  // than fuzzy — the reported problem is genuine accidental duplicates
  // ("Boss Fight" created twice), not near-misses, and fuzzy matching would
  // risk flagging legitimately distinct tags as duplicates.
  const duplicateIds = useMemo(() => {
    const counts = new Map();
    tags.forEach((t) => {
      const key = t.name.trim().toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const dupes = new Set();
    tags.forEach((t) => {
      if (counts.get(t.name.trim().toLowerCase()) > 1) dupes.add(t.id);
    });
    return dupes;
  }, [tags]);

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [tags, query]);

  // Auto-picks the highest-usage selected tag as the merge survivor, but
  // only when the current pick is no longer valid (deselected, or fewer
  // than two selected) — otherwise an explicit choice from the dropdown
  // below would get silently overridden on every render.
  useEffect(() => {
    if (selectedIds.size < 2) {
      setSurvivorId(null);
      return;
    }
    if (survivorId && selectedIds.has(survivorId)) return;
    let best = null;
    let bestCount = -1;
    selectedIds.forEach((id) => {
      const count = tagUsage.get(id) || 0;
      if (count > bestCount) {
        bestCount = count;
        best = id;
      }
    });
    setSurvivorId(best);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, tagUsage]);

  useEffect(() => {
    setMergeArmed(false);
  }, [selectedIds, survivorId]);

  function toggleSelect(tagId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  function startEditing(tag) {
    setEditingId(tag.id);
    setEditValue(tag.name);
  }

  function commitEdit() {
    if (editingId) onRenameTag(editingId, editValue);
    setEditingId(null);
  }

  function openColorPicker(e, tag) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setColorPicker({
      tagId: tag.id,
      x: Math.min(rect.left, window.innerWidth - COLOR_PICKER_WIDTH - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - COLOR_PICKER_HEIGHT - 8),
      color: tag.color,
    });
  }

  function handleDeleteClick(tagId) {
    if (deleteArmedId === tagId) {
      onDeleteTag(tagId);
      setSelectedIds((prev) => {
        if (!prev.has(tagId)) return prev;
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
      setDeleteArmedId(null);
    } else {
      setDeleteArmedId(tagId);
    }
  }

  function handleMergeClick() {
    if (!survivorId) return;
    if (mergeArmed) {
      onMergeTags(Array.from(selectedIds), survivorId);
      setSelectedIds(new Set());
      setMergeArmed(false);
    } else {
      setMergeArmed(true);
    }
  }

  const survivorOptions = Array.from(selectedIds).map((id) => {
    const tag = tags.find((t) => t.id === id);
    const count = tagUsage.get(id) || 0;
    return { value: id, label: `${tag?.name ?? id} (${count} track${count === 1 ? "" : "s"})` };
  });

  return (
    <div className="tag-manager__backdrop">
      <div className="tag-manager" ref={rootRef}>
        <div className="tag-manager__header">
          <div>
            <div className="tag-manager__title">Tag Manager</div>
            <p className="tag-manager__subtitle">
              {tags.length} tag{tags.length === 1 ? "" : "s"}
              {duplicateIds.size > 0 &&
                ` · ${duplicateIds.size} possible duplicate${duplicateIds.size === 1 ? "" : "s"}`}
            </p>
          </div>
          <button className="tag-manager__close-x" onClick={onClose} title="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="tag-manager__search">
          <Icon name="search" size={13} className="tag-manager__search-icon" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tags…"
          />
        </div>

        <div className="tag-manager__list">
          {filteredTags.length === 0 ? (
            <div className="tag-manager__empty">
              {tags.length === 0 ? "No tags yet." : "No tags match your search."}
            </div>
          ) : (
            filteredTags.map((tag) => (
              <div key={tag.id} className="tag-manager__row">
                <input
                  type="checkbox"
                  className="tag-manager__checkbox"
                  checked={selectedIds.has(tag.id)}
                  onChange={() => toggleSelect(tag.id)}
                  title="Select for merge"
                />
                <button
                  className="tag-manager__dot"
                  style={{ background: tag.color, color: tag.color }}
                  onClick={(e) => openColorPicker(e, tag)}
                  title="Change color"
                />
                {editingId === tag.id ? (
                  <input
                    autoFocus
                    className="tag-manager__name-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <button className="tag-manager__name" onClick={() => startEditing(tag)} title="Rename">
                    {tag.name}
                    {duplicateIds.has(tag.id) && (
                      <span className="tag-manager__dupe-badge" title="Another tag has this same name">
                        possible duplicate
                      </span>
                    )}
                  </button>
                )}
                <span className="tag-manager__count">
                  {tagUsage.get(tag.id) || 0} track{(tagUsage.get(tag.id) || 0) === 1 ? "" : "s"}
                </span>
                <button
                  className={
                    "tag-manager__delete" + (deleteArmedId === tag.id ? " tag-manager__delete--armed" : "")
                  }
                  onClick={() => handleDeleteClick(tag.id)}
                  title="Delete tag completely"
                >
                  {deleteArmedId === tag.id ? "Confirm?" : <Icon name="trash" size={13} />}
                </button>
              </div>
            ))
          )}
        </div>

        {selectedIds.size >= 2 && (
          <div className="tag-manager__merge-bar">
            <span className="tag-manager__merge-count">{selectedIds.size} selected</span>
            <span className="tag-manager__merge-label">Merge into</span>
            <Dropdown value={survivorId} onChange={setSurvivorId} options={survivorOptions} />
            <button className="tag-manager__merge-clear" onClick={() => setSelectedIds(new Set())}>
              Clear
            </button>
            <button
              className={"tag-manager__merge-button" + (mergeArmed ? " tag-manager__merge-button--armed" : "")}
              onClick={handleMergeClick}
            >
              {mergeArmed ? "Click again to merge" : "Merge tags"}
            </button>
          </div>
        )}

        {colorPicker && (
          <ColorPicker
            x={colorPicker.x}
            y={colorPicker.y}
            color={colorPicker.color}
            onChange={(color) => onRecolorTag(colorPicker.tagId, color)}
            onClose={() => setColorPicker(null)}
          />
        )}
      </div>
    </div>
  );
}
