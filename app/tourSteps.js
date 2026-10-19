// Steps for the first-login walkthrough (WalkthroughTour.js). Each portal has its own copy.
// `target` is a CSS selector for the element the step points at; leave it out for a centred card.
// The first step is the welcome card and isn't counted in "1 of N".

export const TOUR_PORTAL = 'manager';
export const TOUR_SESSION_KEY = 'hr_portal_user';

const nav = (href) => `nav[aria-label="Main"] a[href="${href}"]`;

export const TOUR_STEPS = [
  {
    title: 'Welcome to the Manager portal',
    body: "Here's a quick look around so you know where everything is. It takes about a minute, and you can skip it at any time.",
  },
  {
    target: nav('/dashboard'),
    title: 'Dashboard',
    body: 'See at a glance what is waiting for your review and how your team is doing.',
  },
  {
    target: nav('/team'),
    title: 'Team',
    body: 'Manage your direct reports and assign staff to projects.',
  },
  {
    target: nav('/approvals'),
    title: 'Approvals',
    body: 'Review leave, budget and claim requests from your team.',
  },
  {
    target: nav('/project-codes'),
    title: 'Progress',
    body: "Your active project codes and your team's progress logs.",
  },
  {
    target: nav('/calendar'),
    title: 'Calendar',
    body: "Public holidays and who's on leave across the company.",
  },
  {
    target: 'input[aria-label="Search"]',
    title: 'Search',
    body: 'Type what you want to do, for example "approve leave", to jump straight to the right page.',
  },
  {
    target: 'button[aria-label^="Notifications"]',
    title: 'Notifications',
    body: 'The bell counts the requests waiting for your review. Open it to go straight to them.',
  },
  {
    target: 'aside a[href="/profile"]',
    title: 'Your profile',
    body: 'Change your password and see the devices you stay signed in on. You can take this tour again from here at any time.',
  },
];
