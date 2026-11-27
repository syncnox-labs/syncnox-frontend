import type { ThemeConfig } from "antd";
const theme: ThemeConfig = {
  token: {
    colorPrimary: "#003220",
    borderRadius: 0,
    colorText: "#172B4D",
    colorTextSecondary: "#44546F",
    colorTextTertiary: "#626F86",
    colorTextPlaceholder: "#626F86",
    colorError: "#C9372C",
    colorSuccess: "#22A06B",
    colorWarning: "#E2B203",
    colorLink: "#0B5D3B",
    colorBgLayout: "#F7F8F9",
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    // Fix focus border width
    lineWidth: 1,
    lineWidthBold: 1,
    // Control border colors
    colorBorder: "#8590A2",
    colorBorderSecondary: "#DCDFE4",
    // Fix focus states
    controlOutlineWidth: 0.5,
    controlOutline: "#003220",
    controlHeight: 32,
    controlHeightLG: 36,
  },
  components: {
    Input: {
      // Remove thick focus border
      activeBorderColor: "#003220",
      hoverBorderColor: "#003220",
      activeShadow: "0 0 0 1px rgba(0, 50, 32, 0.1)",
      errorActiveShadow: "0 0 0 1px #ff4d4f",
      warningActiveShadow: "0 0 0 1px #faad14",
      controlHeight: 32,
      fontSize: 12,
    },
    InputNumber: {
      controlHeight: 32,
      fontSize: 12,
    },
    Select: {
      // Fix dropdown styling
      activeBorderColor: "#003220",
      hoverBorderColor: "#003220",
      //   activeShadow: "0 0 0 1px rgba(0, 50, 32, 0.1)",
      // Fix dropdown options
      optionSelectedBg: "#E7F3ED",
      optionActiveBg: "#F1F2F4",
      optionSelectedColor: "#0B5D3B",
      controlHeight: 32,
      fontSize: 12,
    },
    DatePicker: {
      cellWidth: 32,
      cellHeight: 32,
      activeBorderColor: "#003220",
      hoverBorderColor: "#003220",
      activeShadow: "0 0 0 1px rgba(0, 50, 32, 0.1)",
      controlHeight: 32,
      fontSize: 12,
    },
    Button: {
      // Ensure button styling is consistent
      controlHeight: 32,
      paddingInline: 12,
      fontSize: 12,
      borderRadius: 0,
      fontWeight: 500,
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
      defaultColor: "#172B4D",
      defaultBorderColor: "#B3B9C4",
      defaultBg: "#ffffff",
      defaultHoverColor: "#172B4D",
      defaultHoverBorderColor: "#B3B9C4",
      defaultHoverBg: "#F1F2F4",
      defaultActiveColor: "#0B5D3B",
      defaultActiveBorderColor: "#E7F3ED",
      defaultActiveBg: "#E7F3ED",
    },
    Checkbox: {
      // Match Checkbox UI exactly with AG Grid Table
      controlInteractiveSize: 16,
      borderRadiusSM: 0,
      controlOutlineWidth: 0,
      colorPrimary: "#003220",
      colorPrimaryHover: "#003220",
      colorBorder: "#8590A2",
      fontSize: 12,
    },
    Table: {
      rowSelectedBg: "#E7F3ED",
      rowSelectedHoverBg: "#E7F3ED",
      fontSize: 12,
    },
    Message: {
      colorSuccess: "#003220",
      fontSize: 12,
    },
    Menu: {
      itemSelectedBg: "#E7F3ED",
      itemSelectedColor: "#0B5D3B",
    },
    Progress: {
      colorPrimary: "#003220",
    },
    Radio: {
      colorPrimary: "#003220",
      buttonColor: "#172B4D",
      buttonBg: "#ffffff",
      buttonCheckedBg: "#003220",
      buttonSolidCheckedColor: "#ffffff",
      buttonSolidCheckedBg: "#003220",
      buttonSolidCheckedHoverBg: "#003220",
    },
  },
};

export default theme;
