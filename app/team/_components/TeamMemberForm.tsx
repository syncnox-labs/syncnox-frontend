import { useState, useEffect, useRef } from "react";
import { Form, Button, Flex, Menu, message } from "antd";
import { PlusCircleOutlined } from "@ant-design/icons";
import { Team } from "@/types/team.type";
import {
  MENU_ITEMS,
  INITIAL_FORM_VALUES,
  MenuKey,
  TeamMemberFormProps,
} from "./teamMemberForm.types";

import { transformFormToApi, transformApiToForm } from "./teamMemberForm.utils";
import { useTeamStore } from "@/store/team.store";
import { useDepotStore } from "@/store/depots.store";
import { saveDriverZones } from "@/apis/team.api";
import { isTextInput } from "@/utils/form.utils";
import BasicInformation from "./BasicInformation";
import SkillsAndCost from "./SkillsAndCost";
import MobileAppSection from "./MobileAppSection";
import ServiceZonesSection from "./ServiceZonesSection";
import { AutoSaveSource, useQueuedAutoSave } from "@/hooks/useQueuedAutoSave";

const TeamMemberForm = ({
  initialData = null,
  onSubmit,
  isInline = false,
  showSubmitButton = false,
  form: externalForm,
}: TeamMemberFormProps & { form?: any }) => {
  const [messageApi, contextHolder] = message.useMessage();
  const { createTeamAction, updateTeamAction, isLoading } = useTeamStore();
  const { depots } = useDepotStore();
  const [internalForm] = Form.useForm();
  const form = externalForm || internalForm;

  const [activeSection, setActiveSection] = useState<MenuKey>("basic");
  const [zones, setZones] = useState<any[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [scheduleBreak, setScheduleBreak] = useState(true);
  const [roleType, setRoleType] = useState<string>("driver");
  const [startLocationSameAsDepot, setStartLocationSameAsDepot] =
    useState(true);
  const [endLocationSameAsDepot, setEndLocationSameAsDepot] = useState(true);

  const [startDepotId, setStartDepotId] = useState<number | undefined>(
    undefined
  );
  const [endDepotId, setEndDepotId] = useState<number | undefined>(undefined);
  const latestAuxValuesRef = useRef({
    zones: [] as any[],
    skills: [] as string[],
    scheduleBreak: true,
    startLocationSameAsDepot: true,
    endLocationSameAsDepot: true,
    startDepotId: undefined as number | undefined,
    endDepotId: undefined as number | undefined,
  });

  // Auto-save ref
  const isPrefillingRef = useRef<boolean>(true);
  const prevInitialDataIdRef = useRef<number | null>(null);
  const locationsInitializedRef = useRef(false);
  const triggerAutoSave = () => {
    if (!initialData?.id || isPrefillingRef.current) return;
    scheduleAutoSave();
  };

  // Initialize depot IDs when depots are loaded
  useEffect(() => {
    if (depots.length > 0 && !startDepotId && !endDepotId && !initialData) {
      latestAuxValuesRef.current.startDepotId = depots[0].id;
      latestAuxValuesRef.current.endDepotId = depots[0].id;
      setStartDepotId(depots[0].id);
      setEndDepotId(depots[0].id);
    }
  }, [depots, initialData]);

  // Watch for role_type changes
  const onValuesChange = (changedValues: any) => {
    if (changedValues.role_type) {
      setRoleType(changedValues.role_type);
      // If changing from driver to non-driver, reset to basic section
      if (changedValues.role_type !== "driver" && activeSection !== "basic") {
        setActiveSection("basic");
      }
    }
    
    triggerAutoSave();
  };

  const handleBlurCapture = (e: React.FocusEvent) => {
    // Trigger auto-save when focus leaves a text input
    if (isTextInput(e.target as Element)) {
      triggerAutoSave();
    }
  };

  const persistTeamMember = async (source: AutoSaveSource) => {
    const values = await form.validateFields();
    const latestAuxValues = latestAuxValuesRef.current;
    const startDepot = depots.find((d) => d.id === latestAuxValues.startDepotId);
    const endDepot = depots.find((d) => d.id === latestAuxValues.endDepotId);

    const transformedValues = transformFormToApi(
      values,
      latestAuxValues.skills,
      latestAuxValues.scheduleBreak,
      initialData,
      {
        startLocationSameAsDepot: latestAuxValues.startLocationSameAsDepot,
        endLocationSameAsDepot: latestAuxValues.endLocationSameAsDepot,
        startDepot,
        endDepot,
      }
    );

    try {
      if (initialData?.id) {
        await updateTeamAction(transformedValues);
        if (values.role_type === "driver") {
          try {
            await saveDriverZones(initialData.id, latestAuxValues.zones);
          } catch (zoneError) {
            console.error("Failed to save service zones:", zoneError);
            messageApi.error("Failed to save service zones");
          }
        }
        if (source === "manual") {
          messageApi.success("Team member saved successfully");
          onSubmit?.();
        }
      } else {
        await createTeamAction(transformedValues);
        messageApi.success("Team member created successfully");
        form.resetFields();
        onSubmit?.();
      }
    } catch (e: any) {
      const error = e;
      console.error(error?.detail || error);
      
      let errorMessage = "Something went wrong";
      if (Array.isArray(error?.detail)) {
        errorMessage = error.detail.map((err: any) => {
          if (err.msg?.includes("not a valid email address")) {
            return "Email address is not valid";
          }
          return err.msg;
        }).join(", ");
      } else if (typeof error?.detail === "string") {
        errorMessage = error.detail;
      }
      
      messageApi.error(errorMessage);
      throw e;
    }
  };

  const { scheduleAutoSave, saveNow } = useQueuedAutoSave({
    enabled: Boolean(initialData?.id),
    save: persistTeamMember,
  });

  const onFinish = async () => {
    try {
      if (initialData?.id) {
        await saveNow();
      } else {
        await persistTeamMember("manual");
      }
    } catch {
      // The persistence function already displays the actionable error.
    }
  };

  // Prefill form when initialData changes (for editing)
  useEffect(() => {
    if (
      initialData?.id &&
      initialData.id === prevInitialDataIdRef.current &&
      (locationsInitializedRef.current || depots.length === 0)
    ) {
      return; // Already initialized for this team member, ignore background refetches to prevent overwriting user input
    }

    if (initialData) {
      const isNewTeamMember = initialData.id !== prevInitialDataIdRef.current;
      prevInitialDataIdRef.current = initialData.id;
      isPrefillingRef.current = true;
      const formValues = transformApiToForm(initialData);

      // The parent shares one Ant Design form instance between selected rows.
      // Reset it before prefilling a different member so omitted/null import
      // fields cannot leak from the previously selected driver.
      if (isNewTeamMember) {
        form.resetFields();
      }

      // Set role type
      if (initialData.role_type) {
        setRoleType(initialData.role_type);
      }

      // Set skills
      if (initialData.skills && Array.isArray(initialData.skills)) {
        setSkills(initialData.skills);
      }

      // Set schedule break flag
      setScheduleBreak(Boolean(initialData.break_time_start));

      // Missing locations must stay empty. Only mark "same as depot" when the
      // imported address actually matches a depot; previously NULL addresses
      // incorrectly fell back to depots[0].
      const normalizeAddress = (value?: string | null) =>
        value?.trim().toLocaleLowerCase() || "";
      const startAddress = normalizeAddress(initialData.start_address);
      const endAddress = normalizeAddress(initialData.end_address);
      const matchingStartDepot = startAddress
        ? depots.find(
            (depot) =>
              normalizeAddress(depot.address?.formatted_address) === startAddress
          )
        : undefined;
      const matchingEndDepot = endAddress
        ? depots.find(
            (depot) =>
              normalizeAddress(depot.address?.formatted_address) === endAddress
          )
        : undefined;

      const isStartSameAsDepot = Boolean(matchingStartDepot);
      const isEndSameAsDepot = Boolean(matchingEndDepot);
      locationsInitializedRef.current = depots.length > 0;

      setStartLocationSameAsDepot(isStartSameAsDepot);
      setEndLocationSameAsDepot(isEndSameAsDepot);

      if (matchingStartDepot) {
        setStartDepotId(matchingStartDepot.id);
      }
      if (matchingEndDepot) {
        setEndDepotId(matchingEndDepot.id);
      }

      latestAuxValuesRef.current = {
        ...latestAuxValuesRef.current,
        skills: Array.isArray(initialData.skills) ? initialData.skills : [],
        scheduleBreak: Boolean(initialData.break_time_start),
        startLocationSameAsDepot: isStartSameAsDepot,
        endLocationSameAsDepot: isEndSameAsDepot,
        startDepotId: matchingStartDepot?.id,
        endDepotId: matchingEndDepot?.id,
      };

      form.setFieldsValue({
        ...formValues,
        start_address: initialData.start_address ?? null,
        start_location: initialData.start_location ?? null,
        end_address: initialData.end_address ?? null,
        end_location: initialData.end_location ?? null,
      });
      setTimeout(() => {
        isPrefillingRef.current = false;
      }, 500);
    }
  }, [initialData, form, depots]);

  const handleAddSkill = () => {
    if (skillInput.trim() && !skills.includes(skillInput.trim())) {
      const updatedSkills = [...skills, skillInput.trim()];
      latestAuxValuesRef.current.skills = updatedSkills;
      setSkills(updatedSkills);
      setSkillInput("");
      triggerAutoSave();
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    const updatedSkills = skills.filter((skill) => skill !== skillToRemove);
    latestAuxValuesRef.current.skills = updatedSkills;
    setSkills(updatedSkills);
    triggerAutoSave();
  };

  const isDriver = roleType === "driver";

  const menuItems = [
    { key: "basic", label: "Basic Information" },
    { key: "skillsAndCost", label: "Costs & Skills (Optional)" },
    { key: "serviceZones", label: "Service Areas" },
    { key: "mobileApp", label: "Mobile App" },
  ];

  const filteredMenuItems = isDriver
    ? menuItems
    : menuItems.filter((item) => item.key === "basic");

  return (
    <Flex style={{ height: isInline ? "auto" : "100%", overflow: isInline ? "visible" : "hidden" }}>
      {contextHolder}

      {/* Left Sidebar Menu - always show but filter items based on role */}
      <div
        style={{
          width: "200px",
          borderRight: "1px solid #f0f0f0",
          paddingRight: "8px",
          paddingTop: "12px",
        }}
      >
        <Menu
          mode="inline"
          selectedKeys={[activeSection]}
          onClick={({ key }) => setActiveSection(key as MenuKey)}
          items={filteredMenuItems}
          style={{
            border: "none",
            fontSize: "14px",
          }}
        />
      </div>

      {/* Right Content Area */}
      <Flex
        vertical
        style={{
          flex: 1,
          overflow: isInline ? "visible" : "hidden",
          paddingLeft: "12px",
        }}
      >
        {/* Scrollable Form Area */}
        <Flex
          vertical
          style={{
            flex: 1,
            overflowY: isInline ? "visible" : "auto",
            overflowX: "hidden",
            paddingRight: "8px",
          }}
          className="custom-scrollbar"
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            onValuesChange={onValuesChange}
            onBlurCapture={handleBlurCapture}
            initialValues={INITIAL_FORM_VALUES}
            autoComplete="off"
          >
            {isDriver ? (
              <>
                {/* Render all sections for driver but hide inactive ones */}
                <div
                  style={{
                    display: activeSection === "basic" ? "block" : "none",
                  }}
                >
                  <BasicInformation
                    form={form}
                    scheduleBreak={scheduleBreak}
                    onScheduleBreakChange={(val) => {
                      latestAuxValuesRef.current.scheduleBreak = val;
                      setScheduleBreak(val);
                      triggerAutoSave();
                    }}
                    isDriver={isDriver}
                    startLocationSameAsDepot={startLocationSameAsDepot}
                    onStartLocationSameAsDepotChange={(val) => {
                      latestAuxValuesRef.current.startLocationSameAsDepot = val;
                      setStartLocationSameAsDepot(val);
                      triggerAutoSave();
                    }}
                    endLocationSameAsDepot={endLocationSameAsDepot}
                    onEndLocationSameAsDepotChange={(val) => {
                      latestAuxValuesRef.current.endLocationSameAsDepot = val;
                      setEndLocationSameAsDepot(val);
                      triggerAutoSave();
                    }}
                    startDepotId={startDepotId}
                    setStartDepotId={(val) => {
                      latestAuxValuesRef.current.startDepotId = val;
                      setStartDepotId(val);
                      triggerAutoSave();
                    }}
                    endDepotId={endDepotId}
                    setEndDepotId={(val) => {
                      latestAuxValuesRef.current.endDepotId = val;
                      setEndDepotId(val);
                      triggerAutoSave();
                    }}
                  />
                </div>

                <div
                  style={{
                    display:
                      activeSection === "skillsAndCost" ? "block" : "none",
                  }}
                >
                  <SkillsAndCost
                    skills={skills}
                    skillInput={skillInput}
                    onSkillInputChange={setSkillInput}
                    onAddSkill={handleAddSkill}
                    onRemoveSkill={handleRemoveSkill}
                  />
                </div>

                <div
                  style={{
                    display:
                      activeSection === "serviceZones" ? "block" : "none",
                  }}
                >
                  <ServiceZonesSection
                    driverId={initialData?.id}
                    zones={zones}
                    onZonesChange={(newZones, isUserEdit = true) => {
                      latestAuxValuesRef.current.zones = newZones;
                      setZones(newZones);
                      if (isUserEdit) {
                        triggerAutoSave();
                      }
                    }}
                  />
                </div>

                <div
                  style={{
                    display:
                      activeSection === "mobileApp" ? "block" : "none",
                  }}
                >
                  <MobileAppSection
                    driverId={initialData?.id}
                    initialActivationCode={initialData?.activation_code}
                  />
                </div>
              </>
            ) : (
              // For non-driver roles, show only basic information (first 5 fields)
              <BasicInformation
                form={form}
                scheduleBreak={scheduleBreak}
                onScheduleBreakChange={(val) => {
                  latestAuxValuesRef.current.scheduleBreak = val;
                  setScheduleBreak(val);
                  triggerAutoSave();
                }}
                isDriver={isDriver}
                startLocationSameAsDepot={startLocationSameAsDepot}
                onStartLocationSameAsDepotChange={(val) => {
                  latestAuxValuesRef.current.startLocationSameAsDepot = val;
                  setStartLocationSameAsDepot(val);
                  triggerAutoSave();
                }}
                endLocationSameAsDepot={endLocationSameAsDepot}
                onEndLocationSameAsDepotChange={(val) => {
                  latestAuxValuesRef.current.endLocationSameAsDepot = val;
                  setEndLocationSameAsDepot(val);
                  triggerAutoSave();
                }}
                startDepotId={startDepotId}
                setStartDepotId={(val) => {
                  latestAuxValuesRef.current.startDepotId = val;
                  setStartDepotId(val);
                  triggerAutoSave();
                }}
                endDepotId={endDepotId}
                setEndDepotId={(val) => {
                  latestAuxValuesRef.current.endDepotId = val;
                  setEndDepotId(val);
                  triggerAutoSave();
                }}
              />
            )}
          </Form>
        </Flex>

        {/* Fixed Button at Bottom */}
        {(!isInline || showSubmitButton) && (
          <Flex style={{ paddingTop: "12px" }}>
            <Button
              loading={isLoading}
              type="primary"
              htmlType="submit"
              block
              icon={<PlusCircleOutlined />}
              onClick={() => form.submit()}
            >
              {initialData ? "Save" : "Add Driver"}
            </Button>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
};

export default TeamMemberForm;
