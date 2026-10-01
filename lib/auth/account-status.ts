export function accountIsActive<T extends { isActive: boolean }>(account: T | null): account is T {
  return account?.isActive === true;
}