import type { ThemeConfig } from "antd";
const theme: ThemeConfig = {
  token: {
    colorPrimary: "#003220",
    borderRadius: 0,
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    // Fix focus border width
    lineWidth: 1,
    lineWidthBold: 1,
    // Control border colors
    colorBorder: "#d9d9d9",
    colorBorderSecondary: "#f0f0f0",
    // Fix focus states
    controlOutlineWidth: 0.5,
    controlOutline: "#003220",
    controlHeight: 38, // Increased from default
  },
  components: {
    Input: {
      // Remove thick focus border
      activeBorderColor: "#003220",
      hoverBorderColor: "#003220",
      activeShadow: "0 0 0 1px rgba(0, 50, 32, 0.1)",
      errorActiveShadow: "0 0 0 1px #ff4d4f",
      warningActiveShadow: "0 0 0 1px #faad14",
      controlHeight: 38,
      paddingBlock: 8,
      fontSize: 12,
    },
    Select: {
      // Fix dropdown styling
      activeBorderColor: "#003220",
      hoverBorderColor: "#003220",
      //   activeShadow: "0 0 0 1px rgba(0, 50, 32, 0.1)",
      // Fix dropdown options
      optionSelectedBg: "#ecfdf5",
      optionActiveBg: "#f5f5f5",
      optionSelectedColor: "#003220",
      controlHeight: 38,
      fontSize: 12,
      // paddingBlock: 8,
    },
    DatePicker: {
      cellWidth: 32,
      cellHeight: 32,
      activeBorderColor: "#003220",
      hoverBorderColor: "#003220",
      activeShadow: "0 0 0 1px rgba(0, 50, 32, 0.1)",
      controlHeight: 38,
      paddingBlock: 8,
      fontSize: 12,
    },
    // TimePicker: {
    //   controlHeight: 38,
    //   paddingBlock: 8,
    // },
    Button: {
      // Ensure button styling is consistent
      controlHeight: 38,
      paddingBlock: 8,
      fontSize: 12,
      borderRadius: 0,
      defaultColor: "#1f2937",
      defaultBorderColor: "#d9d9d9",
      defaultBg: "#ffffff",
      defaultHoverColor: "#003220",
      defaultHoverBorderColor: "#003220",
      defaultHoverBg: "#ffffff",
      defaultActiveColor: "#003220",
      defaultActiveBorderColor: "#003220",
    },
    Checkbox: {
      // Match Checkbox UI exactly with AG Grid Table
      controlInteractiveSize: 16,
      borderRadiusSM: 0,
      controlOutlineWidth: 0,
      colorPrimary: "#003220",
      colorPrimaryHover: "#003220",
      colorBorder: "#e5e7eb",
      fontSize: 12,
    },
    Table: {
      rowSelectedBg: "#ecfdf5",
      rowSelectedHoverBg: "#ecfdf5",
      fontSize: 12,
    },
    Message: {
      colorSuccess: "#003220",
      fontSize: 12,
    },
    Menu: {
      itemSelectedBg: "#003220",
      itemSelectedColor: "#ffffff",
    },
    Progress: {
      colorPrimary: "#003220",
    },
    Radio: {
      colorPrimary: "#003220",
      buttonColor: "#1f2937",
      buttonBg: "#ffffff",
      buttonCheckedBg: "#003220",
      buttonSolidCheckedColor: "#ffffff",
      buttonSolidCheckedBg: "#003220",
      buttonSolidCheckedHoverBg: "#003220",
    },
  },
};

export default theme;
