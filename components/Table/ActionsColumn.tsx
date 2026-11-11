import { ColDef } from "ag-grid-community";
import { Dropdown, Modal, message } from "antd";
import { EllipsisVertical } from "lucide-react";

export interface ActionItem<T> {
  /**
   * Unique key for the action
   */
  key: string;

  /**
   * Label to display for the action
   */
  label: string;

  /**
   * Action type - 'delete' actions get special treatment (danger style + confirmation)
   */
  type?: "delete" | "default";

  /**
   * Click handler for the action
   */
  onClick: (data: T) => void | Promise<void>;

  /**
   * Optional danger styling (auto-applied for type: 'delete')
   */
  danger?: boolean;

  /**
   * Optional icon to display
   */
  icon?: React.ReactNode;
}

export interface ActionsColumnConfig<T> {
  /**
   * Array of action items to display in the dropdown
   */
  actions: ActionItem<T>[];

  /**
   * Entity name for delete confirmation modal (e.g., "Job", "Team", "User")
   * Only needed if you have delete actions
   */
  entityName?: string;

  /**
   * Width of the actions column (default: 80)
   */
  width?: number;
}

export const createActionsColumn = <T extends { id: number }>(
  config: ActionsColumnConfig<T>
): ColDef<T> => {
  const { actions, entityName = "record", width = 90 } = config;

  return {
    headerName: "Actions",
    pinned: "right",
    lockVisible: true,
    lockPosition: true,
    resizable: false,
    width,
    sortable: false,
    filter: false,
    cellRenderer: (params: any) => {
      const data: T = params.data;
      if (!data) return null;

      // Map actions to menu items
      const menuItems = actions.map((action) => ({
        key: action.key,
        label: action.label,
        danger: action.type === "delete" || action.danger,
        icon: action.icon,
        onClick: async () => {
          // Special handling for delete actions - show confirmation modal
          if (action.type === "delete") {
            Modal.confirm({
              title: `Delete ${entityName}`,
              content: `Are you sure you want to delete this ${entityName.toLowerCase()}?`,
              okText: "Delete",
              okType: "danger",
              maskClosable: true,
              cancelText: "Cancel",
              onOk: async () => {
                try {
                  await action.onClick(data);
                  message.success(`${entityName} deleted successfully`);
                } catch (error) {
                  console.error(
                    `Failed to delete ${entityName.toLowerCase()}`,
                    error
                  );
                  message.error(`Failed to delete ${entityName.toLowerCase()}`);
                }
              },
            });
          } else {
            // For non-delete actions, execute directly
            try {
              await action.onClick(data);
            } catch (error) {
              console.error(`Action failed:`, error);
              message.error("Action failed");
            }
          }
        },
      }));

      return (
        <Dropdown
          menu={{ items: menuItems }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <button
            type="button"
            aria-label={`Actions for ${String((data as { name?: unknown }).name || data.id)}`}
            className="flex items-center justify-center h-full w-full cursor-pointer border-none bg-transparent p-0"
          >
            <EllipsisVertical size={18} />
          </button>
        </Dropdown>
      );
    },
  };
};
