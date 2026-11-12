package demo;
public class ClienteService {
    private ClienteDAO dao;
    public void consultar(int id) { dao.buscar(id); }
    public void rechazar() { throw new IllegalArgumentException(); }
}
