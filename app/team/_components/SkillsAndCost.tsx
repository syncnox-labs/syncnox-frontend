import { Form, InputNumber, Row, Col, Input, Button, Flex, Tag } from "antd";
import { CloseOutlined } from "@ant-design/icons";

interface SkillsAndCostProps {
  skills: string[];
  skillInput: string;
  onSkillInputChange: (value: string) => void;
  onAddSkill: () => void;
  onRemoveSkill: (skill: string) => void;
}

const SkillsAndCost = ({
  skills,
  skillInput,
  onSkillInputChange,
  onAddSkill,
  onRemoveSkill,
}: SkillsAndCostProps) => {
  return (
    <>
      {/* Cost Section */}
      <h3 className="text-lg font-medium mb-4">Costs</h3>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item label="Fixed cost for Driver" name="fixed_cost_for_driver">
            <InputNumber
              className="w-full"
              placeholder="0"
              min={0}
              prefix="$"
              precision={2}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Cost Per Kilometer" name="cost_per_km">
            <InputNumber
              className="w-full"
              placeholder="1"
              min={0}
              prefix="$"
              precision={2}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item label="Cost Per Hour" name="cost_per_hr">
            <InputNumber
              className="w-full"
              placeholder="20"
              min={0}
              prefix="$"
              precision={2}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label="Cost Per Hour For Overtime"
            name="cost_per_hr_overtime"
          >
            <InputNumber
              className="w-full"
              placeholder="30"
              min={0}
              prefix="$"
              precision={2}
            />
          </Form.Item>
        </Col>
      </Row>
      {/* Skills Section */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-4">Skills</h3>
        <Row gutter={8}>
          <Col flex="auto">
            <Input
              placeholder="Add Skills"
              value={skillInput}
              onChange={(e) => onSkillInputChange(e.target.value)}
              onPressEnter={onAddSkill}
            />
          </Col>
          <Col>
            <Button onClick={onAddSkill}>Add</Button>
          </Col>
        </Row>

        {/* Skills Display Area */}
        <div
          style={{
            minHeight: "80px",
            padding: "12px",
            backgroundColor: "#fafafa",
            borderRadius: "4px",
            marginTop: "12px",
          }}
        >
          {skills.length === 0 ? (
            <div
              style={{ textAlign: "center", color: "#999", padding: "16px 0" }}
            >
              No skills added yet
            </div>
          ) : (
            <Flex gap="8px" wrap="wrap">
              {skills.map((skill) => (
                <Tag
                  style={{
                    padding: "6px 16px",
                    gap: "8px",
                    display: "flex",
                    alignItems: "center",
                  }}
                  variant="outlined"
                  key={skill}
                  closable
                  onClose={() => onRemoveSkill(skill)}
                  closeIcon={<CloseOutlined />}
                >
                  {skill}
                </Tag>
              ))}
            </Flex>
          )}
        </div>
      </div>
    </>
  );
};

export default SkillsAndCost;
