const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");

function load(file, imports) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports.default;
}

function hooks() {
  const state = [];
  let cursor = 0;
  return {
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], next => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
      },
      useMemo: fn => fn(),
      useCallback: fn => fn,
      useEffect() {},
    },
    render(component, props) { cursor = 0; return component(props); },
    unmount() { state.length = 0; },
  };
}

function find(node, predicate) {
  if (!React.isValidElement(node)) return;
  if (predicate(node)) return node;
  for (const child of [node.props.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
}

function setup(kind, items = []) {
  const listHooks = hooks(), modalHooks = hooks();
  const store = { isLoading: false, [kind === "team" ? "teams" : "vehicles"]: items };
  const Null = () => null;
  const antd = { Button: "button", Spin: "spinner", Modal: "modal", Dropdown: "dropdown", message: {},
    Steps: "steps", Typography: { Text: "text", Title: "title" }, Flex: "flex" };
  const Modal = load("components/BulkImport/BulkImportModal.tsx", {
    react: modalHooks.react, antd,
    "./BulkImportFileUploadStep": "upload", "./BulkImportColumnMappingStep": "mapping",
    "./BulkImportDataPreviewStep": "preview",
  });
  const isTeam = kind === "team";
  const List = load(`app/${kind}/_components/${isTeam ? "TeamList" : "VehicleList"}.tsx`, {
    react: listHooks.react, antd,
    [`@/store/${kind}.store`]: { [isTeam ? "useTeamStore" : "useVehicleStore"]: () => store },
    [`@/apis/${kind}.api`]: {}, "@/utils/exportCsv.utils": {},
    [`./${isTeam ? "TeamMemberForm" : "VehicleForm"}`]: Null,
    [`./${isTeam ? "TeamMemberCard" : "VehicleCard"}`]: Null,
    [`./${isTeam ? "AddTeamMemberModal" : "AddVehicleModal"}`]: "add-modal",
    "@/components/BulkImport/BulkImportModal": Modal,
    "@/components/Settings/EntityViewToggle": "entity-view-toggle",
    "@/components/Settings/EntityRecordTable": "entity-table",
    "@/components/Settings/SettingsPageTitle": "settings-page-title",
    "@/utils/settingsTable.columns": { createTeamSettingsColumns: () => [], createVehicleSettingsColumns: () => [] },
    [`@/store/${isTeam ? "vehicle" : "team"}.store`]: { [isTeam ? "useVehicleStore" : "useTeamStore"]: () => ({ vehicles: [], teams: [] }) },
  });
  return {
    store,
    render() {
      const tree = listHooks.render(List);
      const modal = find(tree, node => node.type === Modal);
      if (!modal) modalHooks.unmount();
      return { tree, modal: modal && modalHooks.render(Modal, modal.props),
        add: find(tree, node => node.type === "add-modal") };
    },
  };
}

for (const kind of ["team", "vehicle"]) {
  for (const existing of [[], [{ id: 1, name: "Existing" }]]) {
    test(`${kind}: import retains its preview and completion state with ${existing.length} existing records`, () => {
      const h = setup(kind, existing);
      find(h.render().tree, node => node.props.id === `${kind}-bulk-import-btn`).props.onClick();
      find(h.render().modal, node => node.type === "upload").props.onFileParsed({ rawHeaders: ["name"], rawRows: [{ name: "Imported" }] });
      find(h.render().modal, node => node.type === "mapping").props.onMappingConfirmed({ name: "name" });

      h.store.isLoading = true;
      let view = h.render();
      assert.ok(view.modal, "The import modal must stay mounted during the request");
      assert.ok(find(view.modal, node => node.type === "preview"), "The preview must retain its state");
      h.store[kind === "team" ? "teams" : "vehicles"] = [...existing, { id: 2, name: "Imported" }];
      h.store.isLoading = false;
      find(view.modal, node => node.type === "preview").props.onSuccess(1);
      view = h.render();
      assert.ok(find(view.modal, node => node.props.children === "Import Complete!"));
      assert.equal(find(view.modal, node => node.type === "upload"), undefined);
      find(view.modal, node => node.props.children === "Done").props.onClick();
      view = h.render();
      assert.equal(view.modal.props.open, false);
      view.modal.props.afterClose();
      find(view.tree, node => node.props.id === `${kind}-bulk-import-btn`).props.onClick();
      assert.ok(find(h.render().modal, node => node.type === "upload"), "A deliberate new import starts at upload");
    });
  }

  test(`${kind}: a failed first import keeps the preview available to retry`, () => {
    const h = setup(kind);
    find(h.render().tree, node => node.props.id === `${kind}-bulk-import-btn`).props.onClick();
    find(h.render().modal, node => node.type === "upload").props.onFileParsed({ rawHeaders: ["name"], rawRows: [{ name: "Retry" }] });
    find(h.render().modal, node => node.type === "mapping").props.onMappingConfirmed({ name: "name" });
    h.store.isLoading = true;
    h.render();
    h.store.isLoading = false;
    assert.ok(find(h.render().modal, node => node.type === "preview"));
  });

  test(`${kind}: adding the first record keeps its form mounted during submission`, () => {
    const h = setup(kind);
    const buttonId = kind === "team" ? "team-add-member-btn" : "vehicle-add-btn";
    find(h.render().tree, node => node.props.id === buttonId).props.onClick();
    h.store.isLoading = true;
    assert.equal(h.render().add?.props.open, true);
    h.store.isLoading = false;
    h.render().add.props.setOpen(false);
    assert.equal(h.render().add.props.open, false);
  });

  test(`${kind}: initial fetch still shows a loading indicator`, () => {
    const h = setup(kind);
    h.store.isLoading = true;
    assert.ok(find(h.render().tree, node => node.type === "spinner"));
  });
}
