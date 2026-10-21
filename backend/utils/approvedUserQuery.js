/**
 * Management lists (Students / Teachers) must show Admin-approved accounts only.
 * Legacy rows without approvalStatus are treated as approved (same as login).
 * Pending / rejected registrations stay in Registration Requests.
 */
function approvedRoleFilter(role) {
  return {
    role,
    approvalStatus: { $nin: ["pending", "rejected"] },
  };
}

module.exports = { approvedRoleFilter };
