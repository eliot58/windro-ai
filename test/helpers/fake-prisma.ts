interface FakeUser {
  id: bigint;
  firstName: string;
  isActive: boolean;
  sellerCode: string | null;
  loggedOut: boolean;
}

// База в памяти с теми запросами, которые делает приложение
export function createFakePrisma() {
  const users = new Map<bigint, FakeUser>();

  return {
    users,
    user: {
      findUnique: ({ where }: { where: { id: bigint } }) =>
        Promise.resolve(users.get(where.id) ?? null),
      findMany: ({ where }: { where: { sellerCode: string } }) =>
        Promise.resolve(
          [...users.values()].filter(
            (user) => user.sellerCode === where.sellerCode,
          ),
        ),
      create: ({ data }: { data: { id: bigint; firstName: string } }) => {
        const user: FakeUser = {
          ...data,
          isActive: false,
          sellerCode: null,
          loggedOut: false,
        };
        users.set(data.id, user);
        return Promise.resolve(user);
      },
      update: ({
        where,
        data,
      }: {
        where: { id: bigint };
        data: Partial<FakeUser>;
      }) => Promise.resolve(Object.assign(users.get(where.id)!, data)),
      updateMany: ({
        where,
        data,
      }: {
        where: { id: bigint };
        data: Partial<FakeUser>;
      }) => {
        const user = users.get(where.id);
        if (user) Object.assign(user, data);
        return Promise.resolve({ count: user ? 1 : 0 });
      },
    },
  };
}
