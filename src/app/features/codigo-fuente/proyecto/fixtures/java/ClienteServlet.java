package demo;
public class ClienteServlet extends HttpServlet {
    private ClienteService servicio;
    public void doGet(int id) {
        if (id > 0) {
            servicio.consultar(id);
        } else {
            servicio.rechazar();
        }
        servicio.ausente();
    }
}
