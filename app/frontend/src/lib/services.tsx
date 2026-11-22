import * as React from "react"
import {
  AmbulanceIcon,
  BabyIcon,
  DropletsIcon,
  EarIcon,
  FlameIcon,
  HeartHandshakeIcon,
  HeartPulseIcon,
  RibbonIcon,
  ScanLineIcon,
  StethoscopeIcon,
} from "lucide-react"

export const SERVICE_ICON: Record<string, React.ReactNode> = {
  dialysis: <DropletsIcon />,
  emergency_csection: <HeartHandshakeIcon />,
  nicu: <BabyIcon />,
  cardiac_surgery: <HeartPulseIcon />,
  mri: <ScanLineIcon />,
  trauma: <AmbulanceIcon />,
  burn_care: <FlameIcon />,
  oncology: <RibbonIcon />,
  ent: <EarIcon />,
}

export function serviceIcon(id: string) {
  return SERVICE_ICON[id] ?? <StethoscopeIcon />
}

/** Why the balance of proof / support / closeness differs, in plain words. */
export const PRIORITY: Record<string, string> = {
  dialysis: "Dialysis patients come back two or three times a week, so being close matters most.",
  emergency_csection: "In an emergency delivery every minute counts, so we favour places that are close and clearly able to operate.",
  nicu: "A sick newborn needs help fast, so closeness comes first, followed by clear proof of a newborn unit.",
  trauma: "After an accident every minute counts, so closeness matters more than anything else.",
  cardiac_surgery: "Heart surgery is planned and complex. A well-equipped hospital is worth a longer trip.",
  oncology: "Cancer treatment needs specialised equipment, so a well-equipped centre is worth travelling for.",
  mri: "An MRI scan is usually planned, so we balance a clear listing of the scanner with a short trip.",
  burn_care: "Serious burns need a proper burn unit, which is worth some extra travel.",
  ent: "Ear, nose and throat care is widely available, so we balance proof, staff and distance evenly.",
}

/** The three things we weigh, in one place so every chart uses the same names and colours. */
export const FACTORS = [
  { key: "evidence", name: "Proof", color: "#2a78d6", ink: "#ffffff", question: "Does the facility say, in its own words, that it provides this care?" },
  { key: "capability", name: "Support", color: "#1baf7a", ink: "#05372a", question: "Does it list what this care needs, such as machines, an intensive care unit or a blood bank?" },
  { key: "closeness", name: "Closeness", color: "#eb6834", ink: "#ffffff", question: "How far would the patient have to travel to get there?" },
] as const
