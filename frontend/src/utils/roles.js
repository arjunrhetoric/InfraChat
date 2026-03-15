export const getRoleName = (role) => {
  switch (role) {
    case 1:
      return "Member";
    case 2:
      return "Moderator";
    case 3:
      return "SuperAdmin";
    default:
      return "Unknown";
  }
};
