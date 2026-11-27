import { useState } from "react";
import { Button, Flex, Spin, message, Modal, Alert } from "antd";
import { MobileOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { activateDriver, deactivateDriver } from "@/apis/team.api";
import { useTeamStore } from "@/store/team.store";

interface MobileAppSectionProps {
  driverId?: number;
  initialActivationCode?: string | null;
}

const MobileAppSection = ({
  driverId,
  initialActivationCode,
}: MobileAppSectionProps) => {
  const [activationCode, setActivationCode] = useState<
    string | null | undefined
  >(initialActivationCode);
  const [loading, setLoading] = useState(false);
  const { fetchTeams } = useTeamStore();

  if (!driverId) {
    return (
      <div className="p-4 border border-gray-200 bg-gray-50/50">
        <Alert
          type="info"
          showIcon
          message="Mobile App Access"
          description="Once you save this team member, you will be able to generate their 12-digit mobile app activation code here."
        />
      </div>
    );
  }

  const handleActivate = async () => {
    setLoading(true);
    try {
      const res = await activateDriver(driverId);
      setActivationCode(res.activation_code);
      message.success("Mobile app activated successfully!");
      fetchTeams();
    } catch (err: any) {
      console.error(err);
      message.error(err?.detail ?? "Failed to activate mobile app");
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      await deactivateDriver(driverId);
      setActivationCode(null);
      message.success("Mobile app deactivated successfully!");
      fetchTeams();
    } catch (err: any) {
      console.error(err);
      message.error(err?.detail ?? "Failed to deactivate mobile app");
    } finally {
      setLoading(false);
    }
  };

  const confirmDeactivate = () => {
    Modal.confirm({
      title: "Deactivate mobile app?",
      content: "This will clear the activation key and log the driver out. Are you sure?",
      okText: "Yes",
      cancelText: "No",
      okType: "danger",
      maskClosable: true,
      okButtonProps: { danger: true, className: "!rounded-none" },
      cancelButtonProps: { className: "!rounded-none" },
      onOk: handleDeactivate,
    });
  };

  const formatActivationCode = (code: string) => {
    if (!code) return "";
    const clean = code.replace(/\D/g, "");
    if (clean.length === 12) {
      return `${clean.slice(0, 4)}   ${clean.slice(4, 8)}   ${clean.slice(8, 12)}`;
    }
    return code;
  };

  return (
    <div className="py-2 px-1 min-h-[350px]">
      <h3 className="text-xl font-medium text-gray-900 mb-8">Mobile app</h3>

      <Spin spinning={loading} tip="Processing...">
        <Flex
          vertical
          align="center"
          justify="center"
          className="mt-6 py-10 px-6 border border-[#f0f0f0] bg-[#fafafa] min-h-[220px] rounded-none"
        >
          {activationCode ? (
            <Flex
              vertical
              align="center"
              gap="16px"
              className="w-full max-w-[480px]"
            >
              <div className="w-16 h-16 rounded-full bg-[#e6ecea] flex items-center justify-center mb-2 my-8">
                <SafetyCertificateOutlined className="text-[32px] text-[#003220]" />
              </div>

              <div className="text-lg font-medium text-gray-700 text-center">
                Activation key:{" "}
                <span className="font-mono text-2xl font-medium text-gray-900 ml-2 tracking-[0.5px]">
                  {formatActivationCode(activationCode)}
                </span>
              </div>

              <p className="text-gray-500 text-[13px] text-center mb-4 leading-relaxed">
                Use this activation key on the Syncnox Mobile App to log in as
                this driver.
              </p>

              <Button
                // type="primary"
                danger
                loading={loading}
                onClick={confirmDeactivate}
                className="mb-8 !rounded-none shadow-none"
              >
                Deactivate
              </Button>
            </Flex>
          ) : (
            <Flex
              vertical
              align="center"
              gap="16px"
              className="w-full max-w-[480px] py-8"
            >
              <div className="w-16 h-16 rounded-full bg-[#e6ecea] flex items-center justify-center mb-8 my-8">
                <MobileOutlined className="text-[32px] text-[#003220]" />
              </div>

              <div className="text-base font-medium text-gray-600 text-center">
                This driver's mobile app is not activated
              </div>

              <p className="text-gray-500 text-[13px] text-center mb-4 leading-relaxed">
                Activate the mobile app to generate a unique login key for this
                driver.
              </p>

              <Button
                type="primary"
                loading={loading}
                onClick={handleActivate}
                className="h-10 px-8 text-[13px] font-medium !rounded-none shadow-none mb-8"
              >
                Activate
              </Button>
            </Flex>
          )}
        </Flex>
      </Spin>
    </div>
  );
};

export default MobileAppSection;
