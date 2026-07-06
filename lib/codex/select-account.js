export function selectAccountsForRun(storage, selection = 'all', now = new Date()) {
  const selector = String(selection || 'all').trim();
  const indexedAccounts = storage.accounts.map((account, index) => ({ ...account, index }));
  const availableAccounts = indexedAccounts.filter((account) => {
    if (account.enabled === false) {
      return false;
    }

    if (!account.cooldownUntil) {
      return true;
    }

    return new Date(account.cooldownUntil) <= now;
  });

  if (selector === 'all') {
    return availableAccounts;
  }

  if (selector === 'active') {
    return pickAccount(availableAccounts, storage.activeIndex);
  }

  if (selector === 'pinned') {
    return pickAccount(availableAccounts, storage.pinnedAccountIndex);
  }

  if (selector.startsWith('label:')) {
    const label = selector.slice('label:'.length);
    return availableAccounts.filter((account) => account.label === label);
  }

  if (selector.startsWith('email:')) {
    const email = selector.slice('email:'.length);
    return availableAccounts.filter((account) => account.email === email);
  }

  if (selector.startsWith('id:')) {
    const id = selector.slice('id:'.length);
    return availableAccounts.filter((account) => account.id === id);
  }

  return availableAccounts.filter(
    (account) => account.id === selector || account.email === selector || account.label === selector
  );
}

function pickAccount(accounts, expectedIndex) {
  return accounts.filter((account) => account.index === expectedIndex);
}
