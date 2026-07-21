import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireEmployeeManager } from "@/lib/auth-helpers";
import { AdminPeopleNav } from "../../AdminPeopleNav";

const guidelines = [
  {
    title: "Use availability as a planning boundary",
    items: [
      "Schedule employees only within the availability they have provided.",
      "Unavailable means the employee has not offered that day or time for recurring work.",
      "Availability is a recurring weekly preference; it does not replace a published shift or approved time off.",
    ],
  },
  {
    title: "Confirm changes before publishing shifts",
    items: [
      "Review the employee's profile when a schedule request falls outside the current availability.",
      "Ask the employee to confirm any one-off exception before assigning the shift.",
      "Update the employee's availability only when the recurring schedule has actually changed.",
    ],
  },
  {
    title: "Keep the schedule reliable",
    items: [
      "Use the Scheduling page to compare coverage across the full week.",
      "Keep start and end times accurate to the nearest 30-minute increment.",
      "When availability is unclear or outdated, pause the assignment and escalate to the appropriate manager.",
    ],
  },
];

export default async function SchedulingGuidelinesPage() {
  await requireEmployeeManager();

  return (
    <div className="pp-scheduling-page">
      <div className="pp-scheduling-page-header mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scheduling guidelines</h1>
        <p className="mt-1 text-gray-500">
          Use employee availability consistently when planning and reviewing weekly coverage.
        </p>
      </div>

      <div className="pp-scheduling-nav mb-6">
        <AdminPeopleNav active="guidelines" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {guidelines.map((guideline) => (
          <Card key={guideline.title}>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">{guideline.title}</h2>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-3 pl-5 text-sm leading-6 text-gray-600">
                {guideline.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6 border-blue-100 bg-blue-50/50">
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Need to change availability?</h2>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-gray-600">
          Open the employee&apos;s profile, select <span className="font-medium text-gray-900">Edit</span>,
          and update the weekly availability section. Save the change only after the employee has
          confirmed the recurring schedule.
        </CardContent>
      </Card>
    </div>
  );
}
