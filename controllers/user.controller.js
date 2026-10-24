// User Controller
// Handles user CRUD operations

export const getAllUsers = async (req, res) => {
  res.json({ message: 'Get all users' });
};

export const getUserById = async (req, res) => {
  res.json({ message: `Get user ${req.params.id}` });
};

export const updateUser = async (req, res) => {
  res.json({ message: `Update user ${req.params.id}` });
};

export const deleteUser = async (req, res) => {
  res.json({ message: `Delete user ${req.params.id}` });
};
